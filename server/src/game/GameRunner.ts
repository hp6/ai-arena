import type { GameState, TurnLogEntry, ChatMessage, GameFrame } from "@ai-arena/shared";
import type { Action } from "@ai-arena/shared";
import { MAX_AP, MOVE_COST, ATTACK_COST, MAX_CHAT_LENGTH } from "@ai-arena/shared";
import { createGame, getCurrentFighter, shuffleOrder } from "./GameState.js";
import { validateAction } from "./MoveValidator.js";
import { resolveAttack } from "./CombatResolver.js";
import { generateRandomActions, generateChatMessage } from "../ai/RandomBot.js";
import { getAIMove } from "../ai/OpenRouterClient.js";
import { type AgentConfig, createDefaultConfigs } from "../ai/AgentConfig.js";
import { createGameRecord, insertFrame, updateGameStatus } from "../db/database.js";

const runningGames = new Set<string>();

export function isGameRunning(gameId: string): boolean {
  return runningGames.has(gameId);
}

export function startGame(agents?: AgentConfig[]): string {
  const state = createGame();
  const agentConfigs = agents ?? createDefaultConfigs();

  for (const agent of agentConfigs) {
    const fighter = state.fighters.find((f) => f.id === agent.fighterId);
    if (fighter) {
      const modelShort = agent.model.split("/").pop() ?? agent.model;
      fighter.name = `${fighter.name} [${modelShort}]`;
    }
  }

  // Rebuild initial log entries with updated names
  state.log = [
    {
      round: 0,
      fighterId: "",
      description: "Game starts. 4 fighters enter the arena.",
      details: state.fighters
        .map((f) => `${f.name}: HP ${f.hp}/${f.maxHp}, spawn (${f.position.x},${f.position.y})`)
        .join("\n"),
      actionType: "start",
    },
    {
      round: 1,
      fighterId: "",
      description: `--- Round 1 --- Turn order: ${state.turnOrder.map((id) => state.fighters.find((f) => f.id === id)!.name).join(", ")}`,
      details: `Alive: ${state.fighters.map((f) => `${f.name} (${f.hp} HP)`).join(", ")}`,
      actionType: "round_start",
    },
  ];

  // Persist game metadata
  createGameRecord(state.id, state.fighters, state.arena, agentConfigs);

  // Record opening frames
  let frameIndex = 0;
  const chat: ChatMessage[] = [];
  for (const entry of state.log) {
    const frame = snapshot(state, entry, chat);
    insertFrame(state.id, frameIndex++, frame);
  }

  console.log(`Game created: ${state.id}`);
  for (const a of agentConfigs) {
    const f = state.fighters.find((f) => f.id === a.fighterId);
    console.log(`  ${f?.name}: ${a.model}`);
  }

  // Fire and forget — run the game in the background
  runGameLoop(state, agentConfigs, chat, frameIndex).catch((err) => {
    console.error(`[GameRunner] Fatal error in game ${state.id}:`, err);
    updateGameStatus(state.id, "interrupted", null);
    runningGames.delete(state.id);
  });

  return state.id;
}

function snapshot(state: GameState, logEntry: TurnLogEntry, chat: ChatMessage[]): GameFrame {
  return {
    fighters: state.fighters.map((f) => ({
      gridX: f.position.x,
      gridY: f.position.y,
      hp: f.hp,
      ap: f.ap,
      alive: f.isAlive,
    })),
    activeFighterId: logEntry.fighterId,
    round: logEntry.round,
    logEntry,
    chatMessages: chat.map((c) => ({ ...c })),
  };
}

function pushChat(chat: ChatMessage[], state: GameState, msg: ChatMessage) {
  const capped = { ...msg, text: msg.text.slice(0, MAX_CHAT_LENGTH) };
  chat.push(capped);
  state.chat.push(capped);
}

function commitFrame(
  state: GameState,
  entry: TurnLogEntry,
  chat: ChatMessage[],
  gameId: string,
  frameIndex: number,
): number {
  state.log.push(entry);
  const frame = snapshot(state, entry, chat);
  insertFrame(gameId, frameIndex, frame);
  return frameIndex + 1;
}

async function runGameLoop(
  state: GameState,
  agents: AgentConfig[],
  chat: ChatMessage[],
  frameIndex: number,
) {
  runningGames.add(state.id);
  const maxSteps = 500;
  let steps = 0;

  try {
    while (state.status === "in_progress" && steps < maxSteps) {
      const fighter = getCurrentFighter(state);
      if (!fighter) break;

      // Get AI or random actions for this fighter
      const agentConfig = agents.find((a) => a.fighterId === fighter.id);
      let actions: Action[];

      if (agentConfig) {
        const aiResult = await getAIMove(state, fighter.id, agentConfig.model, agentConfig.personality);
        actions = aiResult.actions;

        if (aiResult.chatMessage) {
          pushChat(chat, state, {
            fighterId: fighter.id,
            fighterName: fighter.name,
            fighterColor: fighter.color,
            text: aiResult.chatMessage,
          });
        }

        if (aiResult.reasoning) {
          console.log(`[AI] ${fighter.name}: "${aiResult.reasoning}"`);
          if (aiResult.fallback) console.log(`[AI] ${fighter.name} used fallback (random bot)`);
        }
      } else {
        actions = generateRandomActions(state, fighter.id);
        const chatMsg = generateChatMessage(state, fighter.id, actions);
        if (chatMsg) {
          pushChat(chat, state, {
            fighterId: fighter.id,
            fighterName: fighter.name,
            fighterColor: fighter.color,
            text: chatMsg,
          });
        }
      }

      // Execute each action
      let ap = MAX_AP;
      for (const action of actions) {
        if (ap <= 0) break;
        const result = executeOneAction(state, fighter.id, action, ap);
        ap = result.apAfter;

        if (result.chatMessage) pushChat(chat, state, result.chatMessage);

        frameIndex = commitFrame(state, result.logEntry, chat, state.id, frameIndex);
        if (result.eliminationEntry) {
          frameIndex = commitFrame(state, result.eliminationEntry, chat, state.id, frameIndex);
        }
        if (result.victoryEntry) {
          frameIndex = commitFrame(state, result.victoryEntry, chat, state.id, frameIndex);
        }

        if (state.status !== "in_progress") break;
        steps++;
      }

      if (state.status === "in_progress") {
        frameIndex = advanceTurn(state, chat, state.id, frameIndex);
      }
      steps++;
    }

    const winner = state.winner;
    updateGameStatus(state.id, "finished", winner);
    console.log(`[GameRunner] Game ${state.id} finished. Winner: ${winner ?? "none"}`);
  } finally {
    runningGames.delete(state.id);
  }
}

interface ActionResult {
  logEntry: TurnLogEntry;
  eliminationEntry: TurnLogEntry | null;
  victoryEntry: TurnLogEntry | null;
  chatMessage: ChatMessage | null;
  apAfter: number;
}

function executeOneAction(state: GameState, fighterId: string, action: Action, ap: number): ActionResult {
  const fighter = state.fighters.find((f) => f.id === fighterId)!;
  const validation = validateAction(state, fighterId, action, ap);

  if (!validation.valid) {
    const newAp = Math.max(0, ap - 1);
    fighter.ap = newAp;
    return {
      logEntry: {
        round: state.round,
        fighterId,
        description: `${fighter.name}: invalid (${action.type}) - ${validation.reason}`,
        details: `Attempted: ${JSON.stringify(action)}\nReason: ${validation.reason}\nAP ${ap}->${newAp}`,
        actionType: "wait",
      },
      eliminationEntry: null,
      victoryEntry: null,
      chatMessage: null,
      apAfter: newAp,
    };
  }

  switch (action.type) {
    case "move": {
      const oldPos = { ...fighter.position };
      fighter.position = { ...action.targetPosition };
      const newAp = ap - MOVE_COST;
      fighter.ap = newAp;
      return {
        logEntry: {
          round: state.round,
          fighterId,
          description: `${fighter.name} moves (${oldPos.x},${oldPos.y})->(${fighter.position.x},${fighter.position.y})`,
          details: `From (${oldPos.x},${oldPos.y}) to (${fighter.position.x},${fighter.position.y}), AP ${ap}->${newAp}`,
          actionType: "move",
        },
        eliminationEntry: null,
        victoryEntry: null,
        chatMessage: null,
        apAfter: newAp,
      };
    }

    case "attack": {
      const target = state.fighters.find((f) => f.id === action.targetId)!;
      const result = resolveAttack(target.hp);
      target.hp = result.targetHpAfter;
      const newAp = ap - ATTACK_COST;
      fighter.ap = newAp;

      let eliminationEntry: TurnLogEntry | null = null;
      let victoryEntry: TurnLogEntry | null = null;
      let chatMessage: ChatMessage | null = null;

      if (result.eliminated) {
        target.isAlive = false;
        target.ap = 0;

        eliminationEntry = {
          round: state.round,
          fighterId,
          description: `${target.name} is ELIMINATED!`,
          details: `${target.name} knocked out by ${fighter.name}. Remaining: ${state.fighters.filter((f) => f.isAlive).length} fighters`,
          actionType: "elimination",
        };

        chatMessage = {
          fighterId: fighter.id,
          fighterName: fighter.name,
          fighterColor: fighter.color,
          text: `${target.name} is out! Who's next?`,
        };

        const aliveCount = state.fighters.filter((f) => f.isAlive).length;
        if (aliveCount <= 1) {
          const winner = state.fighters.find((f) => f.isAlive);
          state.status = "finished";
          state.winner = winner?.id ?? null;
          victoryEntry = {
            round: state.round,
            fighterId: winner?.id ?? "",
            description: `${winner?.name ?? "Nobody"} WINS!`,
            details: winner
              ? `${winner.name} is the last fighter standing with ${winner.hp} HP remaining!`
              : "Draw!",
            actionType: "victory",
          };
          chatMessage = {
            fighterId: winner?.id ?? "",
            fighterName: winner?.name ?? "",
            fighterColor: winner?.color ?? 0,
            text: "GG everyone!",
          };
        }
      }

      return {
        logEntry: {
          round: state.round,
          fighterId,
          description: `${fighter.name} attacks ${target.name} for ${result.damage} dmg -> ${target.hp} HP`,
          details: `Attacker: ${fighter.name} at (${fighter.position.x},${fighter.position.y}), AP ${ap}->${newAp}\nTarget: ${target.name} at (${target.position.x},${target.position.y}), HP ${result.targetHpBefore}->${result.targetHpAfter}\nDamage: ${result.damage}`,
          actionType: "attack",
        },
        eliminationEntry,
        victoryEntry,
        chatMessage,
        apAfter: newAp,
      };
    }

    case "wait": {
      const newAp = ap - 1;
      fighter.ap = newAp;
      return {
        logEntry: {
          round: state.round,
          fighterId,
          description: `${fighter.name} waits`,
          details: `AP ${ap}->${newAp}`,
          actionType: "wait",
        },
        eliminationEntry: null,
        victoryEntry: null,
        chatMessage: null,
        apAfter: newAp,
      };
    }

    default: {
      const newAp = Math.max(0, ap - 1);
      fighter.ap = newAp;
      return {
        logEntry: {
          round: state.round,
          fighterId,
          description: `${fighter.name}: unknown action`,
          details: `AP ${ap}->${newAp}`,
          actionType: "wait",
        },
        eliminationEntry: null,
        victoryEntry: null,
        chatMessage: null,
        apAfter: newAp,
      };
    }
  }
}

function advanceTurn(
  state: GameState,
  chat: ChatMessage[],
  gameId: string,
  frameIndex: number,
): number {
  if (state.status !== "in_progress") return frameIndex;

  state.turnIndex++;

  while (
    state.turnIndex < state.turnOrder.length &&
    !state.fighters.find((f) => f.id === state.turnOrder[state.turnIndex])?.isAlive
  ) {
    state.turnIndex++;
  }

  if (state.turnIndex >= state.turnOrder.length) {
    state.round++;
    state.turnOrder = shuffleOrder(state.fighters);
    state.turnIndex = 0;

    for (const f of state.fighters) {
      if (f.isAlive) f.ap = MAX_AP;
    }

    const entry: TurnLogEntry = {
      round: state.round,
      fighterId: "",
      description: `--- Round ${state.round} --- Turn order: ${state.turnOrder.map((id) => state.fighters.find((f) => f.id === id)!.name).join(", ")}`,
      details: `Alive: ${state.fighters
        .filter((f) => f.isAlive)
        .map((f) => `${f.name} (${f.hp} HP)`)
        .join(", ")}`,
      actionType: "round_start",
    };
    frameIndex = commitFrame(state, entry, chat, gameId, frameIndex);
  }

  const current = getCurrentFighter(state);
  if (current) current.ap = MAX_AP;

  return frameIndex;
}

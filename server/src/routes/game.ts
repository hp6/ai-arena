import { Router } from "express";
import type { GameState, TurnLogEntry, ChatMessage } from "@ai-arena/shared";
import type { Action } from "@ai-arena/shared";
import { MAX_AP, MOVE_COST, ATTACK_COST } from "@ai-arena/shared";
import { createGame, getCurrentFighter, shuffleOrder } from "../game/GameState.js";
import { validateAction } from "../game/MoveValidator.js";
import { resolveAttack } from "../game/CombatResolver.js";
import { generateRandomActions, generateChatMessage } from "../ai/RandomBot.js";

const router = Router();

interface GameSession {
  state: GameState;
  pendingActions: Action[];
  currentAp: number;
}

const games = new Map<string, GameSession>();

router.post("/create", (_req, res) => {
  const state = createGame();
  games.set(state.id, { state, pendingActions: [], currentAp: MAX_AP });
  console.log(`Game created: ${state.id}`);
  res.json({ state, logEntry: state.log[0], chatMessage: null });
});

router.get("/:id/state", (req, res) => {
  const session = games.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json({ state: session.state });
});

// Execute one action and return the result
router.post("/:id/step", (req, res) => {
  const session = games.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { state } = session;

  if (state.status !== "in_progress") {
    res.json({ state, logEntry: null, chatMessage: null, done: true });
    return;
  }

  const fighter = getCurrentFighter(state);
  if (!fighter) {
    res.json({ state, logEntry: null, chatMessage: null, done: true });
    return;
  }

  // Generate actions if we don't have pending ones for this fighter
  if (session.pendingActions.length === 0) {
    session.pendingActions = generateRandomActions(state, fighter.id);
    session.currentAp = MAX_AP;

    // Generate chat before the first action
    const chatMsg = generateChatMessage(state, fighter.id, session.pendingActions);
    if (chatMsg) {
      const cm: ChatMessage = {
        fighterId: fighter.id,
        fighterName: fighter.name,
        fighterColor: fighter.color,
        text: chatMsg,
      };
      state.chat.push(cm);
    }
  }

  // Pop and execute one action
  const action = session.pendingActions.shift()!;
  const result = executeOneAction(state, fighter.id, action, session.currentAp);
  session.currentAp = result.apAfter;

  state.log.push(result.logEntry);
  if (result.eliminationEntry) state.log.push(result.eliminationEntry);
  if (result.victoryEntry) state.log.push(result.victoryEntry);

  const chatMessage = result.chatMessage;
  if (chatMessage) state.chat.push(chatMessage);

  console.log(`[${state.id}] R${state.round} ${fighter.name}: ${action.type} (AP ${result.apAfter})`);

  // If AP exhausted or no more pending actions, advance to next fighter
  if (session.currentAp <= 0 || session.pendingActions.length === 0 || state.status !== "in_progress") {
    advanceTurn(state);
    session.pendingActions = [];
    session.currentAp = MAX_AP;
  }

  res.json({
    state,
    logEntry: result.logEntry,
    eliminationEntry: result.eliminationEntry ?? null,
    victoryEntry: result.victoryEntry ?? null,
    chatMessage: chatMessage ?? null,
    done: state.status !== "in_progress",
  });
});

// Run all remaining turns until the game ends
router.post("/:id/run", (req, res) => {
  const session = games.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { state } = session;
  let steps = 0;
  const maxSteps = 500;

  while (state.status === "in_progress" && steps < maxSteps) {
    const fighter = getCurrentFighter(state);
    if (!fighter) break;

    const actions = generateRandomActions(state, fighter.id);
    const chatMsg = generateChatMessage(state, fighter.id, actions);
    if (chatMsg) {
      state.chat.push({
        fighterId: fighter.id,
        fighterName: fighter.name,
        fighterColor: fighter.color,
        text: chatMsg,
      });
    }

    let ap = MAX_AP;
    for (const action of actions) {
      if (ap <= 0) break;
      const result = executeOneAction(state, fighter.id, action, ap);
      ap = result.apAfter;
      state.log.push(result.logEntry);
      if (result.eliminationEntry) state.log.push(result.eliminationEntry);
      if (result.victoryEntry) state.log.push(result.victoryEntry);
      if (result.chatMessage) state.chat.push(result.chatMessage);
      if (state.status !== "in_progress") break;
      steps++;
    }

    if (state.status === "in_progress") advanceTurn(state);
    steps++;
  }

  session.pendingActions = [];
  session.currentAp = MAX_AP;

  res.json({ state });
});

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
    return {
      logEntry: {
        round: state.round,
        fighterId,
        description: `${fighter.name}: invalid (${action.type}) - ${validation.reason}`,
        details: `Attempted: ${JSON.stringify(action)}\nReason: ${validation.reason}`,
        actionType: "wait",
      },
      eliminationEntry: null,
      victoryEntry: null,
      chatMessage: null,
      apAfter: ap - 1,
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
            details: winner ? `${winner.name} is the last fighter standing with ${winner.hp} HP remaining!` : "Draw!",
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

    default:
      return {
        logEntry: {
          round: state.round,
          fighterId,
          description: `${fighter.name}: unknown action`,
          details: "",
          actionType: "wait",
        },
        eliminationEntry: null,
        victoryEntry: null,
        chatMessage: null,
        apAfter: ap - 1,
      };
  }
}

function advanceTurn(state: GameState) {
  if (state.status !== "in_progress") return;

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

    state.log.push({
      round: state.round,
      fighterId: "",
      description: `--- Round ${state.round} --- Turn order: ${state.turnOrder.map((id) => state.fighters.find((f) => f.id === id)!.name).join(", ")}`,
      details: `Alive: ${state.fighters.filter((f) => f.isAlive).map((f) => `${f.name} (${f.hp} HP)`).join(", ")}`,
      actionType: "round_start",
    });
  }

  const current = getCurrentFighter(state);
  if (current) current.ap = MAX_AP;
}

export default router;

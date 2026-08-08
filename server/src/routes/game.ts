import { Router } from "express";
import type { GameState, TurnLogEntry, ChatMessage, GameFrame } from "@ai-arena/shared";
import type { Action } from "@ai-arena/shared";
import { MAX_AP, MOVE_COST, ATTACK_COST, MAX_CHAT_LENGTH } from "@ai-arena/shared";
import { createGame, getCurrentFighter, shuffleOrder } from "../game/GameState.js";
import { validateAction } from "../game/MoveValidator.js";
import { resolveAttack } from "../game/CombatResolver.js";
import { generateRandomActions, generateChatMessage } from "../ai/RandomBot.js";
import { getAIMove } from "../ai/OpenRouterClient.js";
import { type AgentConfig, createDefaultConfigs } from "../ai/AgentConfig.js";

const router = Router();

interface GameSession {
  state: GameState;
  pendingActions: Action[];
  currentAp: number;
  agents: AgentConfig[];
  /** Replay history, one entry per log entry. Server-owned so replay is accurate. */
  frames: GameFrame[];
  /** Set while an AI call is in flight, so overlapping requests can't double-step. */
  busy: boolean;
}

const games = new Map<string, GameSession>();

/** Single choke point for chat, so the length cap can't be bypassed. */
function pushChat(state: GameState, msg: ChatMessage) {
  state.chat.push({ ...msg, text: msg.text.slice(0, MAX_CHAT_LENGTH) });
}

/** Snapshot the board as it looks right now and attach it to a log entry. */
function recordFrame(session: GameSession, logEntry: TurnLogEntry) {
  const { state } = session;
  session.frames.push({
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
    chatMessages: state.chat.map((c) => ({ ...c })),
  });
}

/** Append a log entry and record the matching replay frame. */
function commitLog(session: GameSession, entry: TurnLogEntry) {
  session.state.log.push(entry);
  recordFrame(session, entry);
}

router.post("/create", (req, res) => {
  const state = createGame();

  // Accept agent configs from the client, or use defaults
  let agents: AgentConfig[];
  if (req.body?.agents && Array.isArray(req.body.agents)) {
    agents = req.body.agents.map((a: any, i: number) => ({
      fighterId: `fighter-${i}`,
      model: a.model || createDefaultConfigs()[i].model,
      personality: a.personality,
    }));
  } else {
    agents = createDefaultConfigs();
  }

  // Update fighter names to include model info
  for (const agent of agents) {
    const fighter = state.fighters.find((f) => f.id === agent.fighterId);
    if (fighter) {
      const modelShort = agent.model.split("/").pop() ?? agent.model;
      fighter.name = `${fighter.name} [${modelShort}]`;
    }
  }

  // Rebuild the initial log entries with updated names
  state.log = [
    {
      round: 0,
      fighterId: "",
      description: "Game starts. 4 fighters enter the arena.",
      details: state.fighters.map((f) => `${f.name}: HP ${f.hp}/${f.maxHp}, spawn (${f.position.x},${f.position.y})`).join("\n"),
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

  const session: GameSession = {
    state,
    pendingActions: [],
    currentAp: MAX_AP,
    agents,
    frames: [],
    busy: false,
  };

  // Record replay frames for the two opening log entries.
  const openingLog = state.log;
  state.log = [];
  for (const entry of openingLog) commitLog(session, entry);

  games.set(state.id, session);

  console.log(`Game created: ${state.id}`);
  for (const a of agents) {
    const f = state.fighters.find((f) => f.id === a.fighterId);
    console.log(`  ${f?.name}: ${a.model}`);
  }

  res.json({ state, frames: session.frames, logEntry: state.log[0], chatMessage: null });
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
router.post("/:id/step", async (req, res) => {
  const session = games.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { state } = session;

  if (state.status !== "in_progress") {
    res.json({ state, frames: session.frames, logEntry: null, chatMessage: null, done: true });
    return;
  }

  // Reject overlapping steps rather than firing a second AI call for the same turn.
  if (session.busy) {
    res.status(409).json({ error: "A step is already in progress for this game" });
    return;
  }
  session.busy = true;

  try {
    const fighter = getCurrentFighter(state);
    if (!fighter) {
      res.json({ state, frames: session.frames, logEntry: null, chatMessage: null, done: true });
      return;
    }

    // Generate actions if we don't have pending ones for this fighter
    if (session.pendingActions.length === 0) {
      const agentConfig = session.agents.find((a) => a.fighterId === fighter.id);

      if (agentConfig) {
        const aiResult = await getAIMove(state, fighter.id, agentConfig.model, agentConfig.personality);
        session.pendingActions = aiResult.actions;

        if (aiResult.chatMessage) {
          pushChat(state, {
            fighterId: fighter.id,
            fighterName: fighter.name,
            fighterColor: fighter.color,
            text: aiResult.chatMessage,
          });
        }

        // Log the AI's reasoning
        if (aiResult.reasoning) {
          console.log(`[AI] ${fighter.name} reasoning: ${aiResult.reasoning}`);
          if (aiResult.fallback) {
            console.log(`[AI] ${fighter.name} used fallback (random bot)`);
          }
        }
      } else {
        // No agent config — use random bot
        session.pendingActions = generateRandomActions(state, fighter.id);
        const chatMsg = generateChatMessage(state, fighter.id, session.pendingActions);
        if (chatMsg) {
          pushChat(state, {
            fighterId: fighter.id,
            fighterName: fighter.name,
            fighterColor: fighter.color,
            text: chatMsg,
          });
        }
      }

      session.currentAp = MAX_AP;
    }

    // A model can legally return zero actions; treat that as passing the turn.
    const action: Action = session.pendingActions.shift() ?? { type: "wait" };
    const result = executeOneAction(state, fighter.id, action, session.currentAp);
    session.currentAp = result.apAfter;

    const chatMessage = result.chatMessage;
    if (chatMessage) pushChat(state, chatMessage);

    // Chat is pushed before the frames so the message shows up alongside its action.
    commitLog(session, result.logEntry);
    if (result.eliminationEntry) commitLog(session, result.eliminationEntry);
    if (result.victoryEntry) commitLog(session, result.victoryEntry);

    console.log(`[${state.id}] R${state.round} ${fighter.name}: ${action.type} (AP ${result.apAfter})`);

    // If AP exhausted or no more pending actions, advance to next fighter
    if (session.currentAp <= 0 || session.pendingActions.length === 0 || state.status !== "in_progress") {
      advanceTurn(session);
      session.pendingActions = [];
      session.currentAp = MAX_AP;
    }

    res.json({
      state,
      frames: session.frames,
      logEntry: result.logEntry,
      eliminationEntry: result.eliminationEntry ?? null,
      victoryEntry: result.victoryEntry ?? null,
      chatMessage: chatMessage ?? null,
      done: state.status !== "in_progress",
    });
  } finally {
    session.busy = false;
  }
});

// Run all remaining turns until the game ends
router.post("/:id/run", async (req, res) => {
  const session = games.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { state } = session;

  if (session.busy) {
    res.status(409).json({ error: "A step is already in progress for this game" });
    return;
  }
  session.busy = true;

  try {
    let steps = 0;
    const maxSteps = 500;

    // Finish any turn the user already stepped partway into before starting fresh turns.
    let carriedActions = session.pendingActions;
    let carriedAp = session.currentAp;
    session.pendingActions = [];

    while (state.status === "in_progress" && steps < maxSteps) {
      const fighter = getCurrentFighter(state);
      if (!fighter) break;

      let actions: Action[];
      let ap: number;

      if (carriedActions.length > 0) {
        actions = carriedActions;
        ap = carriedAp;
        carriedActions = [];
      } else {
        const agentConfig = session.agents.find((a) => a.fighterId === fighter.id);
        let chatMsg: string | null = null;

        if (agentConfig) {
          const aiResult = await getAIMove(state, fighter.id, agentConfig.model, agentConfig.personality);
          actions = aiResult.actions;
          chatMsg = aiResult.chatMessage;
        } else {
          actions = generateRandomActions(state, fighter.id);
          chatMsg = generateChatMessage(state, fighter.id, actions);
        }

        if (chatMsg) {
          pushChat(state, {
            fighterId: fighter.id,
            fighterName: fighter.name,
            fighterColor: fighter.color,
            text: chatMsg,
          });
        }
        ap = MAX_AP;
      }

      for (const action of actions) {
        if (ap <= 0) break;
        const result = executeOneAction(state, fighter.id, action, ap);
        ap = result.apAfter;
        if (result.chatMessage) pushChat(state, result.chatMessage);
        commitLog(session, result.logEntry);
        if (result.eliminationEntry) commitLog(session, result.eliminationEntry);
        if (result.victoryEntry) commitLog(session, result.victoryEntry);
        if (state.status !== "in_progress") break;
        steps++;
      }

      if (state.status === "in_progress") advanceTurn(session);
      steps++;
    }

    session.pendingActions = [];
    session.currentAp = MAX_AP;

    res.json({ state, frames: session.frames });
  } finally {
    session.busy = false;
  }
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
    // An invalid action still burns AP, so keep the fighter's own AP in sync.
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

function advanceTurn(session: GameSession) {
  const { state } = session;
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

    commitLog(session, {
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

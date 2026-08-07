import type { GameState, TurnLogEntry, ChatMessage } from "@ai-arena/shared";
import type { Action } from "@ai-arena/shared";
import { MAX_AP, MOVE_COST, ATTACK_COST } from "@ai-arena/shared";
import { validateAction } from "./MoveValidator.js";
import { resolveAttack } from "./CombatResolver.js";
import { shuffleOrder, getCurrentFighter } from "./GameState.js";

export interface StepResult {
  state: GameState;
  actionsTaken: TurnLogEntry[];
  newChat: ChatMessage[];
}

export function executeTurn(state: GameState, actions: Action[]): StepResult {
  const fighter = getCurrentFighter(state);
  if (!fighter || state.status !== "in_progress") {
    return { state, actionsTaken: [], newChat: [] };
  }

  const actionsTaken: TurnLogEntry[] = [];
  const newChat: ChatMessage[] = [];
  let ap = MAX_AP;

  for (const action of actions) {
    if (ap <= 0) break;

    const validation = validateAction(state, fighter.id, action, ap);
    if (!validation.valid) {
      actionsTaken.push({
        round: state.round,
        fighterId: fighter.id,
        description: `${fighter.name}: invalid action (${action.type}) - ${validation.reason}`,
        details: `Attempted: ${JSON.stringify(action)}\nReason: ${validation.reason}`,
        actionType: "wait",
      });
      continue;
    }

    switch (action.type) {
      case "move": {
        const oldPos = { ...fighter.position };
        fighter.position = { ...action.targetPosition };
        ap -= MOVE_COST;
        fighter.ap = ap;

        actionsTaken.push({
          round: state.round,
          fighterId: fighter.id,
          description: `${fighter.name} moves (${oldPos.x},${oldPos.y})->(${fighter.position.x},${fighter.position.y})`,
          details: `From (${oldPos.x},${oldPos.y}) to (${fighter.position.x},${fighter.position.y}), AP ${ap + MOVE_COST}->${ap}`,
          actionType: "move",
        });
        break;
      }

      case "attack": {
        const target = state.fighters.find((f) => f.id === action.targetId);
        if (!target) break;

        const result = resolveAttack(target.hp);
        target.hp = result.targetHpAfter;
        ap -= ATTACK_COST;
        fighter.ap = ap;

        actionsTaken.push({
          round: state.round,
          fighterId: fighter.id,
          description: `${fighter.name} attacks ${target.name} for ${result.damage} dmg -> ${target.hp} HP`,
          details: `Attacker: ${fighter.name} at (${fighter.position.x},${fighter.position.y}), AP ${ap + ATTACK_COST}->${ap}\nTarget: ${target.name} at (${target.position.x},${target.position.y}), HP ${result.targetHpBefore}->${result.targetHpAfter}\nDamage: ${result.damage}`,
          actionType: "attack",
        });

        if (result.eliminated) {
          target.isAlive = false;
          target.ap = 0;

          actionsTaken.push({
            round: state.round,
            fighterId: fighter.id,
            description: `${target.name} is ELIMINATED!`,
            details: `${target.name} knocked out by ${fighter.name}. Remaining: ${state.fighters.filter((f) => f.isAlive).length} fighters`,
            actionType: "elimination",
          });

          newChat.push({
            fighterId: fighter.id,
            fighterName: fighter.name,
            fighterColor: fighter.color,
            text: `${target.name} is out! Who's next?`,
          });
        }
        break;
      }

      case "wait": {
        ap -= 1;
        fighter.ap = ap;
        actionsTaken.push({
          round: state.round,
          fighterId: fighter.id,
          description: `${fighter.name} waits`,
          details: `AP ${ap + 1}->${ap}`,
          actionType: "wait",
        });
        break;
      }
    }

    // Check for winner
    const aliveCount = state.fighters.filter((f) => f.isAlive).length;
    if (aliveCount <= 1) {
      const winner = state.fighters.find((f) => f.isAlive);
      state.status = "finished";
      state.winner = winner?.id ?? null;
      actionsTaken.push({
        round: state.round,
        fighterId: winner?.id ?? "",
        description: `${winner?.name ?? "Nobody"} WINS!`,
        details: winner ? `${winner.name} is the last fighter standing with ${winner.hp} HP remaining!` : "Draw!",
        actionType: "victory",
      });
      if (winner) {
        newChat.push({
          fighterId: winner.id,
          fighterName: winner.name,
          fighterColor: winner.color,
          text: "GG everyone!",
        });
      }
      break;
    }
  }

  fighter.ap = ap;
  state.log.push(...actionsTaken);
  state.chat.push(...newChat);

  advanceTurn(state);

  return { state, actionsTaken, newChat };
}

function advanceTurn(state: GameState) {
  if (state.status !== "in_progress") return;

  state.turnIndex++;

  // Skip dead fighters
  while (
    state.turnIndex < state.turnOrder.length &&
    !state.fighters.find((f) => f.id === state.turnOrder[state.turnIndex])?.isAlive
  ) {
    state.turnIndex++;
  }

  // If we've gone through all fighters in this round, start new round
  if (state.turnIndex >= state.turnOrder.length) {
    state.round++;
    state.turnOrder = shuffleOrder(state.fighters);
    state.turnIndex = 0;

    // Replenish AP for alive fighters
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

  // Replenish AP for the new current fighter
  const current = getCurrentFighter(state);
  if (current) current.ap = MAX_AP;
}

import type { GameState, Position } from "@ai-arena/shared";
import type { Action } from "@ai-arena/shared";
import { MOVE_COST, ATTACK_COST, ATTACK_RANGE, GRID_WIDTH, GRID_HEIGHT } from "@ai-arena/shared";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateAction(state: GameState, fighterId: string, action: Action, apRemaining: number): ValidationResult {
  const fighter = state.fighters.find((f) => f.id === fighterId);
  if (!fighter) return { valid: false, reason: "Fighter not found" };
  if (!fighter.isAlive) return { valid: false, reason: "Fighter is dead" };

  switch (action.type) {
    case "move":
      return validateMove(state, fighter.position, action.targetPosition, fighterId, apRemaining);
    case "attack":
      return validateAttack(state, fighterId, action.targetId, apRemaining);
    case "wait":
      return { valid: true };
    default:
      return { valid: false, reason: "Unknown action type" };
  }
}

function validateMove(
  state: GameState,
  from: Position,
  to: Position,
  fighterId: string,
  apRemaining: number,
): ValidationResult {
  if (apRemaining < MOVE_COST) {
    return { valid: false, reason: `Not enough AP (need ${MOVE_COST}, have ${apRemaining})` };
  }

  const dist = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  if (dist !== 1) {
    return { valid: false, reason: "Can only move to adjacent cells (manhattan distance 1)" };
  }

  if (to.x < 0 || to.x >= GRID_WIDTH || to.y < 0 || to.y >= GRID_HEIGHT) {
    return { valid: false, reason: "Target is outside the arena" };
  }

  if (state.arena.obstacles.some((o) => o.x === to.x && o.y === to.y)) {
    return { valid: false, reason: "Target cell is an obstacle" };
  }

  const occupied = state.fighters.some(
    (f) => f.id !== fighterId && f.isAlive && f.position.x === to.x && f.position.y === to.y,
  );
  if (occupied) {
    return { valid: false, reason: "Target cell is occupied by another fighter" };
  }

  return { valid: true };
}

function validateAttack(
  state: GameState,
  attackerId: string,
  targetId: string,
  apRemaining: number,
): ValidationResult {
  if (apRemaining < ATTACK_COST) {
    return { valid: false, reason: `Not enough AP (need ${ATTACK_COST}, have ${apRemaining})` };
  }

  const attacker = state.fighters.find((f) => f.id === attackerId);
  const target = state.fighters.find((f) => f.id === targetId);

  if (!target) return { valid: false, reason: "Target not found" };
  if (!target.isAlive) return { valid: false, reason: "Target is already dead" };
  if (attackerId === targetId) return { valid: false, reason: "Cannot attack yourself" };

  const dist = Math.abs(attacker!.position.x - target.position.x) + Math.abs(attacker!.position.y - target.position.y);
  if (dist > ATTACK_RANGE) {
    return { valid: false, reason: `Target out of range (distance ${dist}, range ${ATTACK_RANGE})` };
  }

  return { valid: true };
}

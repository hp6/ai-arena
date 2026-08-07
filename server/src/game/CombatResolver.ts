import { BASE_DAMAGE, DAMAGE_VARIANCE } from "@ai-arena/shared";

export interface CombatResult {
  damage: number;
  targetHpBefore: number;
  targetHpAfter: number;
  eliminated: boolean;
}

export function resolveAttack(targetHp: number): CombatResult {
  const damage = BASE_DAMAGE + Math.floor(Math.random() * DAMAGE_VARIANCE * 2) - DAMAGE_VARIANCE;
  const targetHpAfter = Math.max(0, targetHp - damage);

  return {
    damage,
    targetHpBefore: targetHp,
    targetHpAfter,
    eliminated: targetHpAfter <= 0,
  };
}

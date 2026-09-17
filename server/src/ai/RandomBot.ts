import type { GameState } from "@ai-arena/shared";
import type { Action } from "@ai-arena/shared";
import {
  MOVE_COST,
  ATTACK_COST,
  ATTACK_RANGE,
  GRID_WIDTH,
  GRID_HEIGHT,
  BASE_DAMAGE,
  DAMAGE_VARIANCE,
  KILL_BONUS_AP,
  GOLD_BONUS_AP,
} from "@ai-arena/shared";

export function generateRandomActions(state: GameState, fighterId: string): Action[] {
  const fighter = state.fighters.find((f) => f.id === fighterId);
  if (!fighter || !fighter.isAlive) return [];

  const actions: Action[] = [];
  let ap = fighter.maxAp;
  let gold = state.gold;
  const planned = new Map(state.fighters.map((f) => [f.id, { hp: f.hp, alive: f.isAlive }]));
  const currentPos = { ...fighter.position };
  const obstacles = new Set(state.arena.obstacles.map((o) => `${o.x},${o.y}`));

  while (ap > 0) {
    // Find adjacent enemies
    const adjacentEnemies = state.fighters.filter(
      (f) =>
        f.id !== fighterId &&
        planned.get(f.id)!.alive &&
        Math.abs(f.position.x - currentPos.x) + Math.abs(f.position.y - currentPos.y) <= ATTACK_RANGE,
    );

    // If adjacent to an enemy, attack
    if (adjacentEnemies.length > 0 && ap >= ATTACK_COST) {
      const target = adjacentEnemies[Math.floor(Math.random() * adjacentEnemies.length)];
      actions.push({ type: "attack", targetId: target.id });
      ap -= ATTACK_COST;
      const p = planned.get(target.id)!;
      if (p.hp <= BASE_DAMAGE - DAMAGE_VARIANCE) {
        p.alive = false;
        ap += KILL_BONUS_AP;
      } else {
        p.hp -= BASE_DAMAGE;
      }
      continue;
    }

    // Otherwise, try to move toward closest enemy
    if (ap >= MOVE_COST) {
      const aliveEnemies = state.fighters.filter((f) => f.id !== fighterId && planned.get(f.id)!.alive);
      if (aliveEnemies.length === 0) {
        actions.push({ type: "wait" });
        ap -= 1;
        continue;
      }

      // Find closest enemy
      let closest = aliveEnemies[0];
      let bestDist = Infinity;
      for (const enemy of aliveEnemies) {
        const d = Math.abs(enemy.position.x - currentPos.x) + Math.abs(enemy.position.y - currentPos.y);
        if (d < bestDist) {
          bestDist = d;
          closest = enemy;
        }
      }

      // Find valid adjacent moves
      const dirs = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ];

      const occupiedSet = new Set(
        state.fighters
          .filter((f) => f.id !== fighterId && f.isAlive)
          .map((f) => `${f.position.x},${f.position.y}`),
      );

      const validMoves = dirs
        .map((d) => ({ x: currentPos.x + d.x, y: currentPos.y + d.y }))
        .filter(
          (p) =>
            p.x >= 0 && p.x < GRID_WIDTH && p.y >= 0 && p.y < GRID_HEIGHT &&
            !obstacles.has(`${p.x},${p.y}`) &&
            !occupiedSet.has(`${p.x},${p.y}`),
        );

      if (validMoves.length === 0) {
        actions.push({ type: "wait" });
        ap -= 1;
        continue;
      }

      // Move toward closest enemy
      validMoves.sort((a, b) => {
        const da = Math.abs(a.x - closest.position.x) + Math.abs(a.y - closest.position.y);
        const db = Math.abs(b.x - closest.position.x) + Math.abs(b.y - closest.position.y);
        return da - db;
      });

      const goldMove = validMoves.find((p) => gold && p.x === gold.x && p.y === gold.y);
      const dest = goldMove ?? validMoves[0];
      actions.push({ type: "move", targetPosition: dest });
      currentPos.x = dest.x;
      currentPos.y = dest.y;
      ap -= MOVE_COST;
      if (goldMove) {
        gold = null;
        ap += GOLD_BONUS_AP;
      }
      continue;
    }

    break;
  }

  return actions;
}

export function generateChatMessage(state: GameState, fighterId: string, actions: Action[]): string | null {
  const fighter = state.fighters.find((f) => f.id === fighterId);
  if (!fighter || !fighter.isAlive) return null;
  if (Math.random() > 0.35) return null;

  const hasAttack = actions.some((a) => a.type === "attack");
  const targetIds = actions.filter((a) => a.type === "attack").map((a) => (a as { targetId: string }).targetId);
  const targets = targetIds.map((id) => state.fighters.find((f) => f.id === id)?.name).filter(Boolean);

  if (hasAttack && targets.length > 0) {
    const pool = [
      `Take that, ${targets[0]}!`,
      `${targets[0]}, you can't stop me!`,
      `How'd that feel, ${targets[0]}?`,
      `${targets[0]} should give up now.`,
      `Gotcha!`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const movePool = [
    `Coming for you...`,
    `Repositioning...`,
    `I see you!`,
    `Moving in.`,
    `Can't hide forever!`,
    `Getting closer...`,
  ];
  return movePool[Math.floor(Math.random() * movePool.length)];
}

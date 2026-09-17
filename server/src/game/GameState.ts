import type { GameState, FighterState, ArenaConfig, Position } from "@ai-arena/shared";
import {
  MAX_HP,
  MAX_AP,
  GRID_WIDTH,
  GRID_HEIGHT,
  CELL_SIZE,
  OBSTACLE_COUNT,
  DEFAULT_SPAWN_POSITIONS,
  FIGHTER_COLORS,
  FIGHTER_NAMES,
} from "@ai-arena/shared";

import { getNextGameId } from "../db/database.js";

// Random free cells that keep every spawn and its exits clear and never cut the board into disconnected parts
export function randomObstacles(count: number, spawns: Position[]): Position[] {
  const key = (p: Position) => `${p.x},${p.y}`;
  const reservedKeys = new Set(
    spawns.flatMap((p) => [p, { x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }]).map(key),
  );
  const candidates: Position[] = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (!reservedKeys.has(`${x},${y}`)) candidates.push({ x, y });
    }
  }

  for (;;) {
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const obstacles = candidates.slice(0, count);
    if (isBoardConnected(new Set(obstacles.map(key)))) return obstacles.map((o) => ({ ...o }));
  }
}

function isBoardConnected(blocked: Set<string>): boolean {
  const open = GRID_WIDTH * GRID_HEIGHT - blocked.size;
  const start = DEFAULT_SPAWN_POSITIONS[0];
  const seen = new Set([`${start.x},${start.y}`]);
  const queue: Position[] = [start];
  while (queue.length > 0) {
    const { x, y } = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= GRID_WIDTH || ny >= GRID_HEIGHT || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen.size === open;
}

export function createGame(): GameState {
  const id = `game-${getNextGameId()}`;

  const fighters: FighterState[] = [];
  for (let i = 0; i < 4; i++) {
    fighters.push({
      id: `fighter-${i}`,
      name: FIGHTER_NAMES[i],
      position: { ...DEFAULT_SPAWN_POSITIONS[i] },
      hp: MAX_HP,
      maxHp: MAX_HP,
      ap: MAX_AP,
      maxAp: MAX_AP,
      color: FIGHTER_COLORS[i],
      isAlive: true,
    });
  }

  const arena: ArenaConfig = {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    cellSize: CELL_SIZE,
    obstacles: randomObstacles(OBSTACLE_COUNT, DEFAULT_SPAWN_POSITIONS),
  };

  const turnOrder = shuffleOrder(fighters);

  return {
    id,
    round: 1,
    turnIndex: 0,
    turnOrder,
    fighters,
    arena,
    log: [
      {
        round: 0,
        fighterId: "",
        description: "Game starts. 4 fighters enter the arena.",
        details: fighters.map((f) => `${f.name}: HP ${f.hp}/${f.maxHp}, spawn (${f.position.x},${f.position.y})`).join("\n"),
        actionType: "start",
      },
      {
        round: 1,
        fighterId: "",
        description: `--- Round 1 --- Turn order: ${turnOrder.map((id) => fighters.find((f) => f.id === id)!.name).join(", ")}`,
        details: `Alive: ${fighters.map((f) => `${f.name} (${f.hp} HP)`).join(", ")}`,
        actionType: "round_start",
      },
    ],
    chat: [],
    status: "in_progress",
    winner: null,
  };
}

export function shuffleOrder(fighters: FighterState[]): string[] {
  const alive = fighters.filter((f) => f.isAlive).map((f) => f.id);
  for (let i = alive.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alive[i], alive[j]] = [alive[j], alive[i]];
  }
  return alive;
}

export function getCurrentFighter(state: GameState): FighterState | null {
  if (state.status !== "in_progress") return null;
  const fighterId = state.turnOrder[state.turnIndex];
  return state.fighters.find((f) => f.id === fighterId) ?? null;
}

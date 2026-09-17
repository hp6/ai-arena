import type { GameState, FighterState, ArenaConfig } from "@ai-arena/shared";
import {
  MAX_HP,
  MAX_AP,
  GRID_WIDTH,
  GRID_HEIGHT,
  CELL_SIZE,
  DEFAULT_OBSTACLES,
  DEFAULT_SPAWN_POSITIONS,
  FIGHTER_COLORS,
  FIGHTER_NAMES,
} from "@ai-arena/shared";

import { getNextGameId } from "../db/database.js";

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
    obstacles: DEFAULT_OBSTACLES.map((o) => ({ ...o })),
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

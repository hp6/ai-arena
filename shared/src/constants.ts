export const GRID_WIDTH = 12;
export const GRID_HEIGHT = 12;
export const CELL_SIZE = 48;

export const MAX_CHAT_LENGTH = 50;

export const MAX_HP = 100;
export const MAX_AP = 2;

export const MOVE_COST = 1;
export const ATTACK_COST = 1;

export const BASE_DAMAGE = 20;
export const DAMAGE_VARIANCE = 5;
export const ATTACK_RANGE = 1;

export const FIGHTER_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12];
export const FIGHTER_NAMES = ["Crimson", "Azure", "Emerald", "Amber"];

export const DEFAULT_OBSTACLES: { x: number; y: number }[] = [
  { x: 4, y: 3 },
  { x: 4, y: 4 },
  { x: 11, y: 7 },
  { x: 11, y: 8 },
  { x: 7, y: 5 },
  { x: 8, y: 6 },
];

export const DEFAULT_SPAWN_POSITIONS: { x: number; y: number }[] = [
  { x: 1, y: 1 },
  { x: 10, y: 10 },
  { x: 10, y: 1 },
  { x: 1, y: 10 },
];

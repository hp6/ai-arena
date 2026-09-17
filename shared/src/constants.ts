export const GRID_WIDTH = 8;
export const GRID_HEIGHT = 8;
export const CELL_SIZE = 64;

export const DISPLAY_COLS = 12;
export const DISPLAY_ROWS = 12;
export const GAME_OFFSET = 2;

export const MAX_CHAT_LENGTH = 50;

export const MAX_HP = 100;
export const MAX_AP = 2;

export const MOVE_COST = 1;
export const ATTACK_COST = 1;

export const BASE_DAMAGE = 20;
export const DAMAGE_VARIANCE = 5;
export const ATTACK_RANGE = 1;

export const FIGHTER_COLORS = [0xe74c3c, 0x3498db, 0x9b59b6, 0xf39c12];
export const FIGHTER_NAMES = ["Crimson", "Azure", "Violet", "Amber"];

export const OBSTACLE_COUNT = 4;

export const KILL_BONUS_AP = 1;
export const KILL_HEAL_RATIO = 0.5;
export const GOLD_BONUS_AP = 1;
// Bonuses permanently raise a fighter's AP per turn, so this is the most AP any fighter can ever have
export const MAX_TURN_ACTIONS = MAX_AP + GOLD_BONUS_AP + KILL_BONUS_AP * 3;

export const DEFAULT_SPAWN_POSITIONS: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 7, y: 7 },
  { x: 7, y: 0 },
  { x: 0, y: 7 },
];

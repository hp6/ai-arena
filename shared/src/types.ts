export interface Position {
  x: number;
  y: number;
}

export interface FighterState {
  id: string;
  name: string;
  position: Position;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  color: number;
  isAlive: boolean;
}

export interface ChatMessage {
  fighterId: string;
  fighterName: string;
  fighterColor: number;
  text: string;
}

export interface ArenaConfig {
  width: number;
  height: number;
  cellSize: number;
  obstacles: Position[];
}

export interface TurnLogEntry {
  round: number;
  fighterId: string;
  description: string;
  details: string;
  actionType: "start" | "move" | "attack" | "wait" | "round_start" | "elimination" | "victory";
}

/** A fighter's visual state at one point in the replay. */
export interface FighterSnapshot {
  gridX: number;
  gridY: number;
  hp: number;
  ap: number;
  alive: boolean;
}

/**
 * One replay frame: the board as it looked immediately after a single log entry.
 * The server records these as the game runs so replay is accurate for both
 * per-action stepping and run-to-completion.
 */
export interface GameFrame {
  fighters: FighterSnapshot[];
  activeFighterId: string;
  round: number;
  logEntry: TurnLogEntry;
  chatMessages: ChatMessage[];
}

export interface GameState {
  id: string;
  round: number;
  turnIndex: number;
  turnOrder: string[];
  fighters: FighterState[];
  arena: ArenaConfig;
  log: TurnLogEntry[];
  chat: ChatMessage[];
  status: "waiting" | "in_progress" | "finished";
  winner: string | null;
}

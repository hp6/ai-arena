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
  /** Where the gold started; absent in games from before gold existed. */
  gold?: Position | null;
}

export interface TurnLogEntry {
  round: number;
  fighterId: string;
  description: string;
  actionType: "start" | "move" | "attack" | "wait" | "pickup" | "round_start" | "elimination" | "victory";
}

/** A fighter's visual state at one point in the replay. */
export interface FighterSnapshot {
  gridX: number;
  gridY: number;
  hp: number;
  ap: number;
  /** AP per turn; absent in frames from before bonuses existed. */
  maxAp?: number;
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
  /** Only the lines said on this frame; older matches instead carry the whole conversation so far */
  chat?: { fighterId: string; text: string }[];
  chatMessages?: ChatMessage[];
  gold?: Position | null;
}

export interface GameState {
  id: string;
  round: number;
  turnIndex: number;
  turnOrder: string[];
  fighters: FighterState[];
  arena: ArenaConfig;
  gold: Position | null;
  log: TurnLogEntry[];
  chat: ChatMessage[];
  status: "waiting" | "in_progress" | "finished";
  winner: string | null;
}

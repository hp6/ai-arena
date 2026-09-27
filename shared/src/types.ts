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

/** How a persisted match stands: still playing, played to the end, or cut short by a restart. */
export type MatchStatus = "running" | "finished" | "interrupted";

/** One fighter's contribution to a single match. */
export interface MatchFighter {
  id: string;
  name: string;
  model: string;
  color: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  /** 1 for the winner, null while the match is unfinished. */
  placement: number | null;
}

/** A finished or in-flight match, as the leaderboard and history list see it. */
export interface MatchSummary {
  id: string;
  status: MatchStatus;
  createdAt: string;
  rounds: number;
  turns: number;
  winnerId: string | null;
  fighters: MatchFighter[];
}

/** A model's record across every finished match it played. */
export interface ModelStats {
  model: string;
  /** Rating from finished matches; fair even when models have played very different numbers of games */
  elo: number;
  fighterId: string;
  color: number;
  played: number;
  wins: number;
  winRate: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  avgPlacement: number;
}

/** The payload of GET /api/stats, and of stats.json in a static export. */
export interface Stats {
  totals: { games: number; finished: number; running: number; interrupted: number; avgRounds: number };
  models: ModelStats[];
  matches: MatchSummary[];
}

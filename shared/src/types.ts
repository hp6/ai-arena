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

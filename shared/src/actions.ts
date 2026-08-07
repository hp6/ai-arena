import type { Position } from "./types";

export type ActionType = "move" | "attack" | "wait";

export interface MoveAction {
  type: "move";
  targetPosition: Position;
}

export interface AttackAction {
  type: "attack";
  targetId: string;
}

export interface WaitAction {
  type: "wait";
}

export type Action = MoveAction | AttackAction | WaitAction;

export interface TurnSubmission {
  fighterId: string;
  actions: Action[];
}

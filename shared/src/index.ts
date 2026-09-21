export type PlayerId = string;

export type PlayerState =
  | "idle"
  | "moving"
  | "pushing"
  | "hit"
  | "ragdoll"
  | "recovering"
  | "edge_hang"
  | "eliminated";

export type GameEventType =
  | "push_hit"
  | "big_fall"
  | "edge_save"
  | "final_elimination"
  | "win";

export interface PlayerInput {
  seq: number;
  moveX: number;
  moveY: number;
  push: boolean;
}

export interface PlayerSnapshot {
  id: PlayerId;
  name: string;
  position: [number, number, number];
  rotationY: number;
  velocity: [number, number, number];
  state: PlayerState;
  eliminated: boolean;
  bot: boolean;
}

export interface GameEvent {
  id: string;
  type: GameEventType;
  atMs: number;
  actorId?: PlayerId;
  targetId?: PlayerId;
  importance: number;
}

export interface MatchSnapshot {
  matchId: string;
  serverTimeMs: number;
  timeLeftMs: number;
  phase: "lobby" | "countdown" | "playing" | "finished";
  players: PlayerSnapshot[];
  events: GameEvent[];
  winnerId?: PlayerId;
}

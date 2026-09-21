export const TABLE_PUSH_GEOMETRY = {
  arenaRadius: 8.2,
  spawnRadius: 4.7,
  rimRadius: 8.08,
  dangerStartRadius: 6.35,
} as const;

export type PlayerId = string;

export type PlayerState =
  | "idle"
  | "moving"
  | "pushing"
  | "hit"
  | "ragdoll"
  | "recovering"
  | "edge_hang"
  | "climbing"
  | "celebrate"
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
  rotation: [number, number, number, number];
  facingYaw: number;
  balance: number;
  velocity: [number, number, number];
  score: number;
  pushCooldownLeftMs: number;
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
  countdownLeftMs?: number;
  players: PlayerSnapshot[];
  events: GameEvent[];
  winnerId?: PlayerId;
}

export const TABLE_PUSH_GEOMETRY = {
  // V1.1 venue tuning: roughly +37% playable surface area versus the
  // original 8.2m radius table, giving ten players more recovery room.
  arenaRadius: 9.6,
  spawnRadius: 5.4,
  rimRadius: 9.48,
  dangerStartRadius: 7.65,
  lazySusanRadius: 3.6,
} as const;

export type PlayerId = string;

export type PlayerState =
  | "idle"
  | "moving"
  | "pushing"
  | "grabbing"
  | "carried"
  | "throwing"
  | "jumping"
  | "kicking"
  | "headbutting"
  | "dropkicking"
  | "hit"
  | "ko"
  | "waking"
  | "ragdoll"
  | "recovering"
  | "edge_hang"
  | "climbing"
  | "celebrate"
  | "eliminated";

export type GameEventType =
  | "push_hit"
  | "punch_hit"
  | "heavy_hit"
  | "kick_hit"
  | "headbutt_hit"
  | "dropkick_hit"
  | "ko"
  | "wake"
  | "struggle_break"
  | "grab"
  | "toss"
  | "big_fall"
  | "edge_save"
  | "final_elimination"
  | "win";

export interface PlayerInput {
  seq: number;
  moveX: number;
  moveY: number;
  /** Legacy attack alias retained for older clients/tests. */
  push: boolean;
  attack: boolean;
  grab: boolean;
  sprint: boolean;
  jump: boolean;
  kick: boolean;
}

export interface PlayerSnapshot {
  id: PlayerId;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  facingYaw: number;
  balance: number;
  stamina: number;
  koResistance: number;
  struggleProgress: number;
  sprinting: boolean;
  velocity: [number, number, number];
  score: number;
  pushCooldownLeftMs: number;
  spawnProtectionLeftMs: number;
  grabTargetId?: PlayerId;
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
  matchStage: "opening" | "brawl" | "danger" | "final";
  countdownLeftMs?: number;
  players: PlayerSnapshot[];
  events: GameEvent[];
  arenaState?: {
    centerSpinRadians: number;
    centerSpinSpeed: number;
  };
  winnerId?: PlayerId;
}

export * from "./platform.js";
export * from "./characters.js";

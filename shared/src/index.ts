export const TABLE_PUSH_GEOMETRY = {
  arenaRadius: 8.2,
  spawnRadius: 4.7,
  rimRadius: 8.08,
  dangerStartRadius: 6.35,
  lazySusanRadius: 3.35,
} as const;

export type PlayerId = string;
export type WeaponKind = "pan" | "spatula" | "plate";

export interface WeaponSnapshot {
  id: string;
  kind: WeaponKind;
  position: [number, number, number];
  velocity: [number, number, number];
  heldBy?: PlayerId;
  active: boolean;
}

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
  | "weapon_pickup"
  | "weapon_hit"
  | "weapon_throw"
  | "weapon_drop"
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
  heldWeapon?: WeaponKind;
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
  weapon?: WeaponKind;
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
  weapons?: WeaponSnapshot[];
  winnerId?: PlayerId;
}

export * from "./platform.js";

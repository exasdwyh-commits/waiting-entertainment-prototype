export type GameTier = "base" | "pro" | "custom";

export type RuntimeKind = "embedded" | "process";

export type RoundStatus =
  | "recruiting"
  | "locked"
  | "running"
  | "finished"
  | "cancelled"
  | "expired";

export type QueueTicketStatus =
  | "waiting"
  | "called"
  | "passed"
  | "seated"
  | "cancelled";

export type BroadcastMode =
  | "IDLE_MEDIA"
  | "RECRUITING"
  | "READY"
  | "COUNTDOWN"
  | "LIVE_GAME"
  | "RESULT"
  | "HIGHLIGHT";

export interface GameManifestV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  category: string;
  summary: string;
  players: {
    min: number;
    max: number;
  };
  runtime: {
    kind: RuntimeKind;
    healthPath: string;
    healthProtocol?: string;
    command?: string[];
    workingDirectoryEnv?: string;
    bundledPath?: string;
    port?: number;
    startPath?: string;
  };
  entrypoints: {
    display: string;
    player: string;
  };
  capabilities: {
    aiFill: boolean;
    hotJoin: boolean;
    reconnect: boolean;
    highlights: boolean;
    replay: boolean;
  };
  round: {
    joinPolicy: "ephemeral-code";
    codeTtlSeconds: number;
    lateJoin: boolean;
  };
  commercial: {
    tier: GameTier;
    entitlements: string[];
  };
}

export type RuntimeState =
  | "embedded"
  | "not-configured"
  | "stopped"
  | "starting"
  | "running"
  | "unhealthy"
  | "failed";

export interface GameRuntimeStatus {
  gameId: string;
  kind: RuntimeKind;
  state: RuntimeState;
  configured: boolean;
  managed: boolean;
  port?: number;
  pid?: number;
  startedAt?: number;
  checkedAt: number;
  message?: string;
  configSource?: "embedded" | "environment" | "bundled";
  workingDirectory?: string;
}

export interface StoreLicense {
  storeId: string;
  plan: "BASE" | "PRO" | "CUSTOM";
  entitlements: string[];
}

export interface RoundPlayer {
  id: string;
  name: string;
  joinedAt: number;
  queueTicketId?: string;
}

export interface EntertainmentRound {
  id: string;
  code: string;
  gameId: string;
  status: RoundStatus;
  players: RoundPlayer[];
  playerLimit: number;
  createdAt: number;
  expiresAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface QueueTicket {
  id: string;
  number: string;
  partySize: number;
  label?: string;
  status: QueueTicketStatus;
  createdAt: number;
  calledAt?: number;
  seatedAt?: number;
}

export interface QueueOverlay {
  ticketId: string;
  number: string;
  partySize: number;
  calledAt: number;
}

export interface BroadcastState {
  mode: BroadcastMode;
  round?: EntertainmentRound;
  queueOverlay?: QueueOverlay;
}

export interface PlatformSnapshot {
  license: StoreLicense;
  games: GameManifestV1[];
  allGames: GameManifestV1[];
  runtimes: GameRuntimeStatus[];
  rounds: EntertainmentRound[];
  queue: QueueTicket[];
  broadcast: BroadcastState;
}

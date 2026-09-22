import type { GameManifestV1, StoreLicense } from "@waiting/shared";

export const BUILTIN_GAME_MANIFESTS: readonly GameManifestV1[] = [
  {
    schemaVersion: 1,
    id: "table-push-king",
    name: "餐桌推推王",
    version: "0.1.0",
    category: "physics-party",
    summary: "手机个人视角 + 大屏自动导播的 1-10 人物理派对乱斗。",
    players: { min: 1, max: 10 },
    runtime: {
      kind: "embedded",
      healthPath: "/health",
    },
    entrypoints: {
      display: "http://{host}:5173/",
      player: "http://{host}:5174/",
    },
    capabilities: {
      aiFill: true,
      hotJoin: true,
      reconnect: true,
      highlights: true,
      replay: true,
    },
    round: {
      joinPolicy: "ephemeral-code",
      codeTtlSeconds: 300,
      lateJoin: false,
    },
    commercial: {
      tier: "base",
      entitlements: ["game:table-push-king"],
    },
  },
  {
    schemaVersion: 1,
    id: "pilot-racer",
    name: "极速等位赛",
    version: "0.1.0",
    category: "racing",
    summary: "1-8 人手机驾驶、大屏导播、服务端权威判定的卡丁车竞速。",
    players: { min: 1, max: 8 },
    runtime: {
      kind: "process",
      healthPath: "/info",
      healthProtocol: "pilot-racer/1",
      command: ["node", "server.mjs"],
      workingDirectoryEnv: "PILOT_RACER_DIR",
      port: 9010,
      startPath: "/api/start",
    },
    entrypoints: {
      display: "http://{host}:9010/display",
      player: "http://{host}:9010/",
    },
    capabilities: {
      aiFill: true,
      hotJoin: true,
      reconnect: true,
      highlights: true,
      replay: false,
    },
    round: {
      joinPolicy: "ephemeral-code",
      codeTtlSeconds: 300,
      lateJoin: false,
    },
    commercial: {
      tier: "base",
      entitlements: ["game:pilot-racer"],
    },
  },
  {
    schemaVersion: 1,
    id: "sea-battle",
    name: "海战竞技",
    version: "0.1.0",
    category: "naval-survival",
    summary: "1-8 人海上成长乱斗：物资升级、侧舷自动炮、复活、海怪事件与积分排名。",
    players: { min: 1, max: 8 },
    runtime: {
      kind: "process",
      healthPath: "/info",
      healthProtocol: "sea-battle/1",
      command: ["node", "server.mjs"],
      workingDirectoryEnv: "SEA_BATTLE_DIR",
      port: 9020,
      startPath: "/api/start",
    },
    entrypoints: {
      display: "http://{host}:9020/display",
      player: "http://{host}:9020/",
    },
    capabilities: {
      aiFill: true,
      hotJoin: true,
      reconnect: true,
      highlights: true,
      replay: false,
    },
    round: {
      joinPolicy: "ephemeral-code",
      codeTtlSeconds: 300,
      lateJoin: false,
    },
    commercial: {
      tier: "pro",
      entitlements: ["game:sea-battle"],
    },
  },
];

export class GameRegistry {
  constructor(
    private readonly license: StoreLicense,
    private readonly manifests: readonly GameManifestV1[] = BUILTIN_GAME_MANIFESTS,
  ) {}

  listAll(): GameManifestV1[] {
    return this.manifests.map((manifest) => structuredClone(manifest));
  }

  listAuthorized(): GameManifestV1[] {
    return this.manifests
      .filter((manifest) => this.isAuthorized(manifest))
      .map((manifest) => structuredClone(manifest));
  }

  get(gameId: string): GameManifestV1 | undefined {
    const manifest = this.manifests.find((game) => game.id === gameId);
    return manifest ? structuredClone(manifest) : undefined;
  }

  requireAuthorized(gameId: string): GameManifestV1 {
    const manifest = this.manifests.find((game) => game.id === gameId);
    if (!manifest) {
      throw new Error("unknown-game");
    }
    if (!this.isAuthorized(manifest)) {
      throw new Error("game-not-entitled");
    }
    return structuredClone(manifest);
  }

  private isAuthorized(manifest: GameManifestV1): boolean {
    return manifest.commercial.entitlements.every((grant) =>
      this.license.entitlements.includes(grant),
    );
  }
}

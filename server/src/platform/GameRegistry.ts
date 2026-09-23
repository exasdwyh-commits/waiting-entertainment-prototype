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
    settings: [
      {
        key: "trackId",
        label: "默认赛道",
        type: "enum",
        env: "TRACK",
        wired: true,
        default: "bay",
        options: [
          { value: "bay", label: "海湾大奖赛" },
          { value: "ridge", label: "山脊赛道" },
        ],
      },
      {
        key: "laps",
        label: "单局圈数",
        type: "number",
        env: "LAPS",
        wired: true,
        default: 3,
        min: 1,
        max: 10,
        step: 1,
      },
      {
        key: "seconds",
        label: "时长上限",
        type: "number",
        env: "RACE_SECONDS",
        wired: true,
        default: 150,
        min: 30,
        max: 300,
        step: 10,
      },
    ],
    commercial: {
      tier: "base",
      entitlements: ["game:pilot-racer"],
    },
  },
  {
    schemaVersion: 1,
    id: "sea-battle",
    name: "海战竞技",
    version: "0.2.0",
    category: "naval-survival",
    summary: "1-8 人海上成长乱斗：物资升级、侧舷自动炮、悬赏旗舰、连沉奖励、海怪事件与积分排名。",
    players: { min: 1, max: 8 },
    runtime: {
      kind: "process",
      healthPath: "/info",
      healthProtocol: "sea-battle/1",
      command: ["node", "server.mjs"],
      workingDirectoryEnv: "SEA_BATTLE_DIR",
      bundledPath: "games/sea-battle",
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
    settings: [
      {
        key: "seconds",
        label: "单局时长",
        type: "number",
        env: "RACE_SECONDS",
        wired: true,
        default: 180,
        min: 60,
        max: 300,
        step: 10,
        description: "三阶段海战节奏的总时长，修改后在下次启动进程时生效。",
      },
    ],
    commercial: {
      tier: "pro",
      entitlements: ["game:sea-battle"],
    },
  },
];

function manifestError(id: string, reason: string): never {
  throw new Error(`manifest-invalid:${id}:${reason}`);
}

function assertPortableEntrypoint(id: string, kind: string, value: string): void {
  if (!value) manifestError(id, `${kind}-entrypoint-empty`);
  if (value.includes("localhost") || value.includes("127.0.0.1")) {
    manifestError(id, `${kind}-entrypoint-not-lan-portable`);
  }
  if (!(value.startsWith("/") || value.includes("{host}"))) {
    manifestError(id, `${kind}-entrypoint-missing-host-placeholder`);
  }
}

export function validateGameManifests(
  manifests: readonly GameManifestV1[],
): void {
  const ids = new Set<string>();
  const processPorts = new Map<number, string>();

  for (const manifest of manifests) {
    const id = manifest.id?.trim();
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      manifestError(id || "unknown", "invalid-id");
    }
    if (ids.has(id)) throw new Error(`manifest-duplicate-id:${id}`);
    ids.add(id);

    if (manifest.schemaVersion !== 1) manifestError(id, "schema-version");
    if (!manifest.name?.trim()) manifestError(id, "name-empty");
    if (!manifest.version?.trim()) manifestError(id, "version-empty");
    if (!manifest.category?.trim()) manifestError(id, "category-empty");
    if (!manifest.summary?.trim()) manifestError(id, "summary-empty");

    if (
      !manifest.runtime ||
      !["embedded", "process"].includes(manifest.runtime.kind)
    ) {
      manifestError(id, "runtime-kind");
    }
    if (!manifest.entrypoints) manifestError(id, "entrypoints");
    if (!manifest.capabilities) manifestError(id, "capabilities");
    if (
      typeof manifest.capabilities.aiFill !== "boolean" ||
      typeof manifest.capabilities.hotJoin !== "boolean" ||
      typeof manifest.capabilities.reconnect !== "boolean" ||
      typeof manifest.capabilities.highlights !== "boolean" ||
      typeof manifest.capabilities.replay !== "boolean"
    ) {
      manifestError(id, "capabilities-shape");
    }
    if (
      !manifest.round ||
      manifest.round.joinPolicy !== "ephemeral-code" ||
      !Number.isInteger(manifest.round.codeTtlSeconds) ||
      manifest.round.codeTtlSeconds < 30 ||
      typeof manifest.round.lateJoin !== "boolean"
    ) {
      manifestError(id, "round-contract");
    }
    if (
      !manifest.commercial ||
      !["base", "pro", "custom"].includes(manifest.commercial.tier)
    ) {
      manifestError(id, "commercial-contract");
    }

    const minPlayers = manifest.players?.min;
    const maxPlayers = manifest.players?.max;
    if (
      !Number.isInteger(minPlayers) ||
      !Number.isInteger(maxPlayers) ||
      minPlayers < 1 ||
      maxPlayers < minPlayers ||
      maxPlayers > 32
    ) {
      manifestError(id, "invalid-player-range");
    }

    if (!manifest.runtime.healthPath?.startsWith("/")) {
      manifestError(id, "health-path");
    }
    if (
      manifest.runtime.startPath !== undefined &&
      !manifest.runtime.startPath.startsWith("/")
    ) {
      manifestError(id, "start-path");
    }

    assertPortableEntrypoint(id, "display", manifest.entrypoints.display);
    assertPortableEntrypoint(id, "player", manifest.entrypoints.player);

    const expectedEntitlement = `game:${id}`;
    if (
      !Array.isArray(manifest.commercial.entitlements) ||
      manifest.commercial.entitlements.length === 0 ||
      !manifest.commercial.entitlements.includes(expectedEntitlement)
    ) {
      manifestError(id, `missing-entitlement:${expectedEntitlement}`);
    }

    if (manifest.settings) {
      const settingKeys = new Set<string>();
      for (const setting of manifest.settings) {
        if (!setting.key?.trim() || settingKeys.has(setting.key)) {
          manifestError(id, "invalid-setting-key");
        }
        settingKeys.add(setting.key);
        if (!setting.label?.trim()) manifestError(id, "setting-label");
        if (!["text", "number", "enum", "boolean"].includes(setting.type)) {
          manifestError(id, "setting-type");
        }
        if (setting.type === "enum" && !setting.options?.length) {
          manifestError(id, "setting-options");
        }
        if (
          setting.wired &&
          manifest.runtime.kind === "process" &&
          !setting.env?.trim()
        ) {
          manifestError(id, "wired-setting-env");
        }
      }
    }

    if (manifest.runtime.kind === "process") {
      if (!manifest.runtime.command?.length) manifestError(id, "process-command");
      if (
        !manifest.runtime.workingDirectoryEnv?.trim() &&
        !manifest.runtime.bundledPath?.trim()
      ) {
        manifestError(id, "process-working-directory");
      }
      if (
        manifest.runtime.bundledPath !== undefined &&
        (!manifest.runtime.bundledPath.trim() ||
          manifest.runtime.bundledPath.includes("..") ||
          manifest.runtime.bundledPath.startsWith("/"))
      ) {
        manifestError(id, "process-bundled-path");
      }
      if (!manifest.runtime.healthProtocol?.trim()) {
        manifestError(id, "process-health-protocol");
      }

      const port = manifest.runtime.port;
      if (!Number.isInteger(port) || (port ?? 0) < 1024 || (port ?? 0) > 65535) {
        manifestError(id, "process-port");
      }
      const existing = processPorts.get(port!);
      if (existing) {
        throw new Error(`manifest-duplicate-port:${port}:${existing}:${id}`);
      }
      processPorts.set(port!, id);
    } else {
      if (
        manifest.runtime.command?.length ||
        manifest.runtime.workingDirectoryEnv ||
        manifest.runtime.bundledPath ||
        manifest.runtime.port ||
        manifest.runtime.healthProtocol ||
        manifest.runtime.startPath
      ) {
        manifestError(id, "embedded-runtime-has-process-fields");
      }
    }
  }
}

export class GameRegistry {
  private manifests: GameManifestV1[];

  constructor(
    private readonly license: StoreLicense,
    manifests: readonly GameManifestV1[] = BUILTIN_GAME_MANIFESTS,
  ) {
    validateGameManifests(manifests);
    this.manifests = manifests.map((manifest) => structuredClone(manifest));
  }

  replace(manifests: readonly GameManifestV1[]): void {
    validateGameManifests(manifests);
    this.manifests = manifests.map((manifest) => structuredClone(manifest));
  }

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

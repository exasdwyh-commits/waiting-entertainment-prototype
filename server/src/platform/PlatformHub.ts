import type {
  BroadcastState,
  EntertainmentRound,
  PlatformSnapshot,
  QueueOverlay,
  QueueTicketStatus,
  RoundStatus,
  StoreLicense,
} from "@waiting/shared";
import { BUILTIN_GAME_MANIFESTS, GameRegistry } from "./GameRegistry.js";
import { GameRegistryManager } from "./GameRegistryManager.js";
import { GameSettingsStore } from "./GameSettingsStore.js";
import { QueueService } from "./QueueService.js";
import { RoundManager } from "./RoundManager.js";
import { RuntimeManager } from "./RuntimeManager.js";

const QUEUE_OVERLAY_TTL_MS = 12_000;

function parseEntitlements(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultEntitlements(plan: StoreLicense["plan"]): string[] {
  if (plan === "PRO") {
    return ["game:table-push-king", "game:pilot-racer", "game:sea-battle", "updates:pro"];
  }
  if (plan === "CUSTOM") {
    return ["game:table-push-king", "game:pilot-racer", "game:sea-battle"];
  }
  return ["game:table-push-king", "game:pilot-racer"];
}

export function createStoreLicenseFromEnv(): StoreLicense {
  const rawPlan = (process.env.WAITING_PLAN ?? "BASE").toUpperCase();
  const plan: StoreLicense["plan"] =
    rawPlan === "PRO" || rawPlan === "CUSTOM" ? rawPlan : "BASE";
  const explicit = parseEntitlements(process.env.WAITING_ENTITLEMENTS);

  return {
    storeId: process.env.WAITING_STORE_ID?.trim() || "local-demo-store",
    plan,
    entitlements: explicit.length > 0 ? explicit : defaultEntitlements(plan),
  };
}

export class PlatformHub {
  readonly registry: GameRegistry;
  readonly rounds = new RoundManager();
  readonly queue = new QueueService();
  readonly settings = new GameSettingsStore();
  readonly runtime = new RuntimeManager(this.settings);

  constructor(
    readonly license: StoreLicense = createStoreLicenseFromEnv(),
    private readonly registryManager = new GameRegistryManager(),
  ) {
    let manifests;
    try {
      manifests = registryManager.load();
    } catch (error) {
      console.warn(
        "[GameCenter] Installed package discovery failed; using built-in safe baseline.",
        error,
      );
      manifests = BUILTIN_GAME_MANIFESTS;
    }
    this.registry = new GameRegistry(license, manifests);
  }

  snapshot(): PlatformSnapshot {
    const games = this.registry.listAuthorized();
    return {
      license: structuredClone(this.license),
      games,
      allGames: this.registry.listAll(),
      runtimes: this.runtime.list(games),
      rounds: this.rounds.list(),
      queue: this.queue.list(),
      broadcast: this.broadcastState(),
    };
  }

  async snapshotFresh(): Promise<PlatformSnapshot> {
    const games = this.registry.listAuthorized();
    await this.runtime.refreshAll(games);
    return {
      license: structuredClone(this.license),
      games,
      allGames: this.registry.listAll(),
      runtimes: this.runtime.list(games),
      rounds: this.rounds.list(),
      queue: this.queue.list(),
      broadcast: this.broadcastState(),
    };
  }

  reloadGamePackages() {
    const hasActiveRound = this.rounds
      .list()
      .some((round) => ["recruiting", "locked", "running"].includes(round.status));
    if (hasActiveRound) {
      throw new Error("game-registry-active-round");
    }

    const manifests = this.registryManager.refresh();
    this.registry.replace(manifests);
    return this.registry.listAll();
  }

  createRound(gameId: string, playerLimit?: number): EntertainmentRound {
    const manifest = this.registry.requireAuthorized(gameId);
    this.runtime.assertConfigured(manifest);
    return this.rounds.create(manifest, playerLimit);
  }

  joinRound(code: string, name: string, queueTicketId?: string): EntertainmentRound {
    return this.rounds.joinByCode(code, name, queueTicketId);
  }

  transitionRound(roundId: string, next: RoundStatus): EntertainmentRound {
    return this.rounds.transition(roundId, next);
  }

  transitionQueue(ticketId: string, next: QueueTicketStatus) {
    return this.queue.transition(ticketId, next);
  }

  broadcastState(): BroadcastState {
    const latestRound = this.rounds
      .list()
      .find((round) => !["cancelled", "expired"].includes(round.status));

    const mode: BroadcastState["mode"] = (() => {
      if (!latestRound) return "IDLE_MEDIA";
      switch (latestRound.status) {
        case "recruiting":
          return "RECRUITING";
        case "locked":
          return "READY";
        case "running":
          return "LIVE_GAME";
        case "finished":
          return "RESULT";
        default:
          return "IDLE_MEDIA";
      }
    })();

    const called = this.queue.latestCalled();
    let queueOverlay: QueueOverlay | undefined;
    if (
      called?.calledAt &&
      Date.now() - called.calledAt <= QUEUE_OVERLAY_TTL_MS
    ) {
      queueOverlay = {
        ticketId: called.id,
        number: called.number,
        partySize: called.partySize,
        calledAt: called.calledAt,
      };
    }

    return {
      mode,
      ...(latestRound ? { round: latestRound } : {}),
      ...(queueOverlay ? { queueOverlay } : {}),
    };
  }
}

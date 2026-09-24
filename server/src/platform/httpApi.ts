import type { IncomingMessage, ServerResponse } from "node:http";
import type { EntertainmentRound, QueueTicketStatus, RoundStatus } from "@waiting/shared";
import { PlatformHub } from "./PlatformHub.js";

const MAX_BODY_BYTES = 16 * 1024;

export interface PlatformHttpHooks {
  onRoundStarted?: (round: EntertainmentRound) => void | Promise<void>;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(value));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("request-body-too-large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid-json-body");
  }
  return parsed as Record<string, unknown>;
}

function errorStatus(message: string): number {
  if (message === "unknown-game" || message === "round-not-found" || message === "queue-ticket-not-found") {
    return 404;
  }
  if (message === "game-not-entitled") return 403;
  if (
    message === "runtime-not-configured" ||
    message === "runtime-start-failed" ||
    message === "runtime-health-timeout" ||
    message === "runtime-health-protocol-mismatch" ||
    message === "runtime-port-conflict" ||
    message === "runtime-start-action-failed" ||
    message === "runtime-port-missing"
  ) {
    return 503;
  }
  if (
    message === "round-full" ||
    message === "active-round-exists" ||
    message === "runtime-active-round" ||
    message === "game-registry-active-round"
  ) return 409;
  if (
    message.startsWith("invalid-round-transition") ||
    message.startsWith("invalid-queue-transition") ||
    message === "round-not-recruiting"
  ) {
    return 409;
  }
  if (
    message === "request-body-too-large" ||
    message === "invalid-json-body" ||
    message.includes("JSON")
  ) {
    return 400;
  }
  return 400;
}

export async function handlePlatformRequest(
  req: IncomingMessage,
  res: ServerResponse,
  hub: PlatformHub,
  hooks: PlatformHttpHooks = {},
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/platform")) {
    return false;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return true;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/platform") {
      json(res, 200, await hub.snapshotFresh());
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/platform/games") {
      const games = hub.registry.listAuthorized();
      await hub.runtime.refreshAll(games);
      json(res, 200, {
        license: hub.license,
        games,
        runtimes: hub.runtime.list(games),
        allGames: hub.registry.listAll(),
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/platform/games/rescan") {
      const allGames = hub.reloadGamePackages();
      const games = hub.registry.listAuthorized();
      await hub.runtime.refreshAll(games);
      json(res, 200, {
        ok: true,
        count: allGames.length,
        games,
        allGames,
        runtimes: hub.runtime.list(games),
      });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/platform/rounds") {
      json(res, 200, { rounds: hub.rounds.list() });
      return true;
    }

    // P1-2：Game settings 读写。GET 返回 resolved 值与已修改清单；
    // PUT 只接受 setting values 平铺对象；正在运行的 runtime 不热改，
    // 只返回 restartRequired: true。
    const settingsMatch = url.pathname.match(
      /^\/api\/platform\/games\/([^/]+)\/settings$/,
    );
    if (settingsMatch && (req.method === "GET" || req.method === "PUT")) {
      const manifest = hub.registry.get(settingsMatch[1]);
      if (!manifest) throw new Error("unknown-game");

      if (req.method === "GET") {
        json(res, 200, { gameId: manifest.id, ...hub.settings.state(manifest) });
        return true;
      }

      const body = await readJson(req);
      const state = hub.settings.update(manifest, body);
      const runtime = await hub.runtime.refresh(manifest, true);
      json(res, 200, {
        gameId: manifest.id,
        ...state,
        restartRequired: runtime.state === "running",
      });
      return true;
    }

    const settingsResetMatch = url.pathname.match(
      /^\/api\/platform\/games\/([^/]+)\/settings\/reset$/,
    );
    if (settingsResetMatch && req.method === "POST") {
      const manifest = hub.registry.get(settingsResetMatch[1]);
      if (!manifest) throw new Error("unknown-game");
      const state = hub.settings.reset(manifest);
      const runtime = await hub.runtime.refresh(manifest, true);
      json(res, 200, {
        gameId: manifest.id,
        ...state,
        restartRequired: runtime.state === "running",
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/platform/rounds") {
      const body = await readJson(req);
      if (typeof body.gameId !== "string") throw new Error("gameId-required");
      const playerLimit =
        typeof body.playerLimit === "number" ? body.playerLimit : undefined;
      json(res, 201, { round: hub.createRound(body.gameId, playerLimit) });
      return true;
    }

    const joinMatch = url.pathname.match(/^\/api\/platform\/join\/([A-Za-z0-9]+)$/);
    if (req.method === "POST" && joinMatch) {
      const body = await readJson(req);
      const name = typeof body.name === "string" ? body.name : "";
      const queueTicketId =
        typeof body.queueTicketId === "string" ? body.queueTicketId : undefined;
      json(res, 200, {
        round: hub.joinRound(joinMatch[1], name, queueTicketId),
      });
      return true;
    }

    const roundMatch = url.pathname.match(
      /^\/api\/platform\/rounds\/([^/]+)\/(lock|reopen|start|finish|cancel)$/,
    );
    if (req.method === "POST" && roundMatch) {
      const transitions: Record<string, RoundStatus> = {
        lock: "locked",
        reopen: "recruiting",
        start: "running",
        finish: "finished",
        cancel: "cancelled",
      };
      const roundId = roundMatch[1];
      const action = roundMatch[2];
      const current = hub.rounds.get(roundId);
      if (!current) throw new Error("round-not-found");
      const manifest = hub.registry.requireAuthorized(current.gameId);

      if (action === "lock" && manifest.runtime.kind === "process") {
        if (current.status !== "recruiting") {
          throw new Error(`invalid-round-transition:${current.status}->locked`);
        }
        await hub.runtime.prepareRound(manifest, current);
      }

      if (action === "start") {
        if (current.status !== "locked") {
          throw new Error(`invalid-round-transition:${current.status}->running`);
        }
        await hub.runtime.beginRound(manifest, current);
        await hooks.onRoundStarted?.(current);
      }

      const round = hub.transitionRound(roundId, transitions[action]);

      if (action === "finish" || action === "cancel") {
        await hub.runtime.endRound(manifest);
      }

      json(res, 200, {
        round,
        runtime: hub.runtime.status(manifest),
      });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/platform/queue") {
      json(res, 200, { queue: hub.queue.list() });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/platform/queue") {
      const body = await readJson(req);
      const partySize =
        typeof body.partySize === "number" ? body.partySize : Number(body.partySize);
      if (!Number.isFinite(partySize) || partySize < 1) {
        throw new Error("partySize-required");
      }
      const label = typeof body.label === "string" ? body.label : undefined;
      const ticket = hub.queue.add(partySize, label);
      json(res, 201, { ...hub.queue.status(ticket.id) });
      return true;
    }

    const queueTicketMatch = url.pathname.match(
      /^\/api\/platform\/queue\/([^/]+)$/,
    );
    if (req.method === "GET" && queueTicketMatch) {
      json(res, 200, hub.queue.status(queueTicketMatch[1]));
      return true;
    }

    const queueMatch = url.pathname.match(
      /^\/api\/platform\/queue\/([^/]+)\/(call|recall|return|pass|seat|cancel)$/,
    );
    if (req.method === "POST" && queueMatch) {
      const action = queueMatch[2];
      const ticket = action === "recall"
        ? hub.queue.recall(queueMatch[1])
        : hub.transitionQueue(queueMatch[1], {
            call: "called",
            return: "waiting",
            pass: "passed",
            seat: "seated",
            cancel: "cancelled",
          }[action] as QueueTicketStatus);
      json(res, 200, hub.queue.status(ticket.id));
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/platform/runtimes") {
      const games = hub.registry.listAuthorized();
      await hub.runtime.refreshAll(games);
      json(res, 200, { runtimes: hub.runtime.list(games) });
      return true;
    }

    const runtimeActionMatch = url.pathname.match(
      /^\/api\/platform\/runtimes\/([^/]+)\/(start|stop)$/,
    );
    if (req.method === "POST" && runtimeActionMatch) {
      const gameId = runtimeActionMatch[1];
      const action = runtimeActionMatch[2];
      const manifest = hub.registry.requireAuthorized(gameId);
      const active = hub.rounds.activeForGame(gameId);

      if (
        action === "stop" &&
        active &&
        ["locked", "running"].includes(active.status)
      ) {
        throw new Error("runtime-active-round");
      }

      if (action === "start") {
        await hub.runtime.ensureRunning(manifest);
      } else {
        await hub.runtime.stop(gameId);
      }

      json(res, 200, {
        runtime: await hub.runtime.refresh(manifest, true),
      });
      return true;
    }

    const runtimeCheckMatch = url.pathname.match(
      /^\/api\/platform\/runtimes\/([^/]+)\/check$/,
    );
    if (req.method === "POST" && runtimeCheckMatch) {
      const manifest = hub.registry.requireAuthorized(runtimeCheckMatch[1]);
      json(res, 200, {
        runtime: await hub.runtime.refresh(manifest, true),
      });
      return true;
    }

    const runtimeLogsMatch = url.pathname.match(
      /^\/api\/platform\/runtimes\/([^/]+)\/logs$/,
    );
    if (req.method === "GET" && runtimeLogsMatch) {
      const manifest = hub.registry.requireAuthorized(runtimeLogsMatch[1]);
      json(res, 200, {
        runtime: hub.runtime.status(manifest),
        logs: hub.runtime.logs(manifest.id),
      });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/platform/broadcast") {
      json(res, 200, hub.broadcastState());
      return true;
    }

    json(res, 404, { ok: false, error: "platform-route-not-found" });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "platform-error";
    json(res, errorStatus(message), { ok: false, error: message });
    return true;
  }
}

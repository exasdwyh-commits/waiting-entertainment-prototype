import type { IncomingMessage, ServerResponse } from "node:http";
import type { EntertainmentRound, QueueTicketStatus, RoundStatus } from "@waiting/shared";
import { PlatformHub } from "./PlatformHub.js";

const MAX_BODY_BYTES = 16 * 1024;

export interface PlatformHttpHooks {
  onRoundStarted?: (round: EntertainmentRound) => void | Promise<void>;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
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
  if (message === "round-full" || message === "active-round-exists") return 409;
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
      json(res, 200, hub.snapshot());
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/platform/games") {
      json(res, 200, {
        license: hub.license,
        games: hub.registry.listAuthorized(),
        allGames: hub.registry.listAll(),
      });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/platform/rounds") {
      json(res, 200, { rounds: hub.rounds.list() });
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
      const round = hub.transitionRound(roundMatch[1], transitions[roundMatch[2]]);
      if (roundMatch[2] === "start") {
        await hooks.onRoundStarted?.(round);
      }
      json(res, 200, { round });
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
      json(res, 201, { ticket: hub.queue.add(partySize, label) });
      return true;
    }

    const queueMatch = url.pathname.match(
      /^\/api\/platform\/queue\/([^/]+)\/(call|return|pass|seat|cancel)$/,
    );
    if (req.method === "POST" && queueMatch) {
      const transitions: Record<string, QueueTicketStatus> = {
        call: "called",
        return: "waiting",
        pass: "passed",
        seat: "seated",
        cancel: "cancelled",
      };
      json(res, 200, {
        ticket: hub.transitionQueue(queueMatch[1], transitions[queueMatch[2]]),
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

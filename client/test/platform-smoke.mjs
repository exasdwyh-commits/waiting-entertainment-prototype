import assert from "node:assert/strict";
import { io } from "socket.io-client";

const base = process.env.WAITING_SERVER_URL ?? "http://127.0.0.1:3001";

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const cors = await fetch(base + "/api/platform", { method: "OPTIONS" });
assert.equal(cors.status, 204);
assert.equal(cors.headers.get("access-control-allow-origin"), "*");
assert.match(cors.headers.get("access-control-allow-methods") ?? "", /POST/);

const games = await api("/api/platform/games");
assert.equal(games.license.plan, "BASE");
assert.ok(games.games.some((game) => game.id === "table-push-king"));
assert.ok(games.games.some((game) => game.id === "pilot-racer"));
const pilotRuntime = games.runtimes.find((runtime) => runtime.gameId === "pilot-racer");
assert.equal(pilotRuntime.state, "not-configured");
assert.equal(pilotRuntime.configured, false);

const created = await api("/api/platform/rounds", {
  method: "POST",
  body: JSON.stringify({ gameId: "table-push-king", playerLimit: 2 }),
});
assert.equal(created.round.status, "recruiting");
assert.equal(created.round.playerLimit, 2);
assert.match(created.round.code, /^[A-Z0-9]{6}$/);

const duplicateRound = await fetch(base + "/api/platform/rounds", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gameId: "table-push-king" }),
});
assert.equal(duplicateRound.status, 409);
assert.equal((await duplicateRound.json()).error, "active-round-exists");

const joined = await api(`/api/platform/join/${created.round.code}`, {
  method: "POST",
  body: JSON.stringify({ name: "CI 玩家" }),
});
assert.equal(joined.round.players.length, 1);
assert.equal(joined.round.players[0].name, "CI 玩家");

const locked = await api(`/api/platform/rounds/${created.round.id}/lock`, {
  method: "POST",
});
assert.equal(locked.round.status, "locked");

const started = await api(`/api/platform/rounds/${created.round.id}/start`, {
  method: "POST",
});
assert.equal(started.round.status, "running");

async function socketJoin(payload) {
  return await new Promise((resolve, reject) => {
    const socket = io(base, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("socket join timeout"));
    }, 5_000);

    socket.on("connect", () => {
      socket.emit("join", payload, (response) => {
        clearTimeout(timer);
        socket.close();
        resolve(response);
      });
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

const unauthorizedJoin = await socketJoin({
  sessionId: "ci-intruder",
  name: "Intruder",
});
assert.equal(unauthorizedJoin.ok, false);
assert.equal(unauthorizedJoin.reason, "round-admission-required");

const authorizedJoin = await socketJoin({
  sessionId: "ci-authorized",
  name: "CI 玩家",
  roundCode: created.round.code,
});
assert.equal(authorizedJoin.ok, true);

const queue = await api("/api/platform/queue", {
  method: "POST",
  body: JSON.stringify({ partySize: 4, label: "测试等位" }),
});
assert.equal(queue.ticket.status, "waiting");

const called = await api(`/api/platform/queue/${queue.ticket.id}/call`, {
  method: "POST",
});
assert.equal(called.ticket.status, "called");

const broadcast = await api("/api/platform/broadcast");
assert.equal(broadcast.mode, "LIVE_GAME");
assert.equal(broadcast.round.id, created.round.id);
assert.equal(broadcast.queueOverlay.ticketId, queue.ticket.id);

const finished = await api(`/api/platform/rounds/${created.round.id}/finish`, {
  method: "POST",
});
assert.equal(finished.round.status, "finished");

const unconfiguredPilot = await fetch(base + "/api/platform/rounds", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gameId: "pilot-racer" }),
});
assert.equal(unconfiguredPilot.status, 503);
assert.equal((await unconfiguredPilot.json()).error, "runtime-not-configured");

const disabledGame = await api("/api/platform/content/games/table-push-king/disable", {
  method: "POST",
  body: "{}",
});
assert.ok(disabledGame.content.disabledGameIds.includes("table-push-king"));

const disabledRound = await fetch(base + "/api/platform/rounds", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gameId: "table-push-king" }),
});
assert.equal(disabledRound.status, 409);
assert.equal((await disabledRound.json()).error, "game-disabled");

await api("/api/platform/content/games/table-push-king/enable", {
  method: "POST",
  body: "{}",
});

const addedMedia = await api("/api/platform/content/media", {
  method: "POST",
  body: JSON.stringify({
    kind: "message",
    title: "CI 候场素材",
    headline: "下一轮马上开始",
    durationSeconds: 5,
  }),
});
assert.equal(addedMedia.media.kind, "message");

const disabledMedia = await api(
  `/api/platform/content/media/${addedMedia.media.id}/disable`,
  { method: "POST", body: "{}" },
);
assert.equal(
  disabledMedia.content.media.find((item) => item.id === addedMedia.media.id).enabled,
  false,
);

const removedMedia = await api(
  `/api/platform/content/media/${addedMedia.media.id}/delete`,
  { method: "POST", body: "{}" },
);
assert.equal(
  removedMedia.content.media.some((item) => item.id === addedMedia.media.id),
  false,
);

console.log("Platform smoke test passed: CORS, single active round, round admission, runtime configuration guard, persistent content controls, independent queue and broadcast composition are healthy.");

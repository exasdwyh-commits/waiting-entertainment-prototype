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

const rescanned = await api("/api/platform/games/rescan", {
  method: "POST",
  body: "{}",
});
assert.equal(rescanned.ok, true);
assert.equal(rescanned.count, 3);
assert.deepEqual(
  rescanned.allGames.map((game) => game.id).sort(),
  ["pilot-racer", "sea-battle", "table-push-king"],
);

const embeddedCheck = await api("/api/platform/runtimes/table-push-king/check", {
  method: "POST",
  body: "{}",
});
assert.equal(embeddedCheck.runtime.state, "embedded");
assert.equal(embeddedCheck.runtime.configured, true);

const pilotCheck = await api("/api/platform/runtimes/pilot-racer/check", {
  method: "POST",
  body: "{}",
});
assert.equal(pilotCheck.runtime.state, "not-configured");
assert.equal(pilotCheck.runtime.configured, false);

const pilotLogs = await api("/api/platform/runtimes/pilot-racer/logs");
assert.equal(pilotLogs.runtime.state, "not-configured");
assert.deepEqual(pilotLogs.logs, []);

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
assert.equal(queue.ahead, 0);
assert.equal(queue.position, 1);

const queueSecond = await api("/api/platform/queue", {
  method: "POST",
  body: JSON.stringify({ partySize: 2, label: "第二桌" }),
});
assert.equal(queueSecond.ahead, 1);
assert.equal(queueSecond.position, 2);

const queueSecondStatus = await api(`/api/platform/queue/${queueSecond.ticket.id}`);
assert.equal(queueSecondStatus.ahead, 1);
assert.equal(queueSecondStatus.position, 2);

const called = await api(`/api/platform/queue/${queue.ticket.id}/call`, {
  method: "POST",
});
assert.equal(called.ticket.status, "called");

const queueSecondAfterCall = await api(`/api/platform/queue/${queueSecond.ticket.id}`);
assert.equal(queueSecondAfterCall.ahead, 0);
assert.equal(queueSecondAfterCall.position, 1);

const firstCalledAt = called.ticket.calledAt;
const recalled = await api(`/api/platform/queue/${queue.ticket.id}/recall`, {
  method: "POST",
});
assert.equal(recalled.ticket.status, "called");
assert.ok(recalled.ticket.calledAt > firstCalledAt);

const broadcast = await api("/api/platform/broadcast");
assert.equal(broadcast.mode, "LIVE_GAME");
assert.equal(broadcast.round.id, created.round.id);
assert.equal(broadcast.queueOverlay.ticketId, queue.ticket.id);
assert.equal(broadcast.queueOverlay.calledAt, recalled.ticket.calledAt);

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

// Game settings API（P1-2）：读默认、写覆盖、拒绝非法、拒绝未知键、恢复默认。
// 先恢复默认，保证测试在已有本地覆盖的状态下也可重复运行。
await api("/api/platform/games/pilot-racer/settings/reset", {
  method: "POST",
  body: "{}",
});
const settingsDefaults = await api("/api/platform/games/pilot-racer/settings");
assert.equal(settingsDefaults.gameId, "pilot-racer");
assert.equal(settingsDefaults.values.laps, 3);
assert.equal(settingsDefaults.values.trackId, "bay");
assert.deepEqual(settingsDefaults.overrides, {});

const settingsSaved = await api("/api/platform/games/pilot-racer/settings", {
  method: "PUT",
  body: JSON.stringify({ laps: 5 }),
});
assert.equal(settingsSaved.values.laps, 5);
assert.equal(settingsSaved.overrides.laps, 5);
// pilot-racer 在 CI 中未配置运行目录，不会因保存参数误报重启。
assert.equal(settingsSaved.restartRequired, false);

const settingsInvalid = await fetch(base + "/api/platform/games/pilot-racer/settings", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ laps: 99 }),
});
assert.equal(settingsInvalid.status, 400);
assert.match((await settingsInvalid.json()).error, /^settings-invalid-value/);

const settingsUnknown = await fetch(base + "/api/platform/games/pilot-racer/settings", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ notASetting: 1 }),
});
assert.equal(settingsUnknown.status, 400);
assert.match((await settingsUnknown.json()).error, /^settings-unknown-key/);

const settingsMissingGame = await fetch(base + "/api/platform/games/no-such-game/settings");
assert.equal(settingsMissingGame.status, 404);

const settingsReset = await api("/api/platform/games/pilot-racer/settings/reset", {
  method: "POST",
  body: "{}",
});
assert.equal(settingsReset.values.laps, 3);
assert.deepEqual(settingsReset.overrides, {});

console.log("Platform smoke test passed: CORS, runtime diagnostics, single active round, round admission, configuration guard, independent queue and broadcast composition, and game settings API are healthy.");

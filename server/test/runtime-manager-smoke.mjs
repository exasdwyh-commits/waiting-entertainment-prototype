import assert from "node:assert/strict";
import { resolve } from "node:path";
import { RuntimeManager } from "../dist/platform/RuntimeManager.js";

const fixtureDir = resolve("server/test/fixtures/runtime");
process.env.RUNTIME_FIXTURE_DIR = fixtureDir;

const manifest = {
  schemaVersion: 1,
  id: "runtime-fixture",
  name: "Runtime Fixture",
  version: "1",
  category: "test",
  summary: "runtime manager fixture",
  players: { min: 1, max: 2 },
  runtime: {
    kind: "process",
    healthPath: "/info",
    command: ["node", "fixture-server.mjs"],
    workingDirectoryEnv: "RUNTIME_FIXTURE_DIR",
    port: 19090,
    startPath: "/api/start",
  },
  entrypoints: {
    display: "http://{host}:19090/display",
    player: "http://{host}:19090/",
  },
  capabilities: {
    aiFill: false,
    hotJoin: false,
    reconnect: false,
    highlights: false,
    replay: false,
  },
  round: {
    joinPolicy: "ephemeral-code",
    codeTtlSeconds: 60,
    lateJoin: false,
  },
  commercial: {
    tier: "base",
    entitlements: ["game:runtime-fixture"],
  },
};

const round = {
  id: "round-fixture",
  code: "ABC123",
  gameId: manifest.id,
  status: "locked",
  players: [],
  playerLimit: 2,
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};

const manager = new RuntimeManager();
assert.equal(manager.status(manifest).state, "stopped");
assert.equal(manager.status(manifest).configured, true);

const running = await manager.beginRound(manifest, round);
assert.equal(running.state, "running");
assert.equal(running.managed, true);
assert.ok(running.pid);

const info = await fetch("http://127.0.0.1:19090/info").then((response) => response.json());
assert.equal(info.roomCode, "ABC123");
assert.equal(info.starts, 1);

await manager.endRound(manifest);
await new Promise((resolvePromise) => setTimeout(resolvePromise, 120));

const stopped = manager.status(manifest);
assert.equal(stopped.state, "stopped");
assert.equal(stopped.managed, false);

let offline = false;
try {
  await fetch("http://127.0.0.1:19090/info", {
    signal: AbortSignal.timeout(350),
  });
} catch {
  offline = true;
}
assert.equal(offline, true);

delete process.env.RUNTIME_FIXTURE_DIR;
assert.equal(manager.status(manifest).state, "not-configured");

console.log("RuntimeManager smoke passed: launch, health, start action, room code, and shutdown.");

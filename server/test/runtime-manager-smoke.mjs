import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
    healthProtocol: "runtime-fixture/1",
    command: ["node", "fixture-server.mjs"],
    workingDirectoryEnv: "RUNTIME_FIXTURE_DIR",
    bundledPath: "server/test/fixtures/runtime",
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
assert.equal(manager.status(manifest).configSource, "environment");
assert.equal(manager.status(manifest).workingDirectory, fixtureDir);

const prepared = await manager.prepareRound(manifest, round);
assert.equal(prepared.state, "running");
assert.equal(prepared.managed, true);
assert.ok(prepared.pid);

const beforeStart = await fetch("http://127.0.0.1:19090/info").then((response) => response.json());
assert.equal(beforeStart.roomCode, "ABC123");
assert.equal(beforeStart.starts, 0);

const running = await manager.beginRound(manifest, round);
assert.equal(running.state, "running");
assert.equal(running.managed, true);

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

// An externally started process should still be discovered as healthy, but the
// Hub must not claim ownership of a process it did not spawn.
const external = spawn("node", ["fixture-server.mjs"], {
  cwd: fixtureDir,
  env: { ...process.env, PORT: "19090", ROOM_CODE: "EXTERNAL" },
  stdio: "ignore",
});
try {
  let discovered;
  for (let attempt = 0; attempt < 30; attempt++) {
    discovered = await manager.refresh(manifest, true);
    if (discovered.state === "running") break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 60));
  }
  assert.equal(discovered?.state, "running");
  assert.equal(discovered?.managed, false);
  assert.equal(discovered?.pid, undefined);

  external.kill("SIGTERM");
  await new Promise((resolvePromise) => external.once("exit", resolvePromise));
  const refreshedStopped = await manager.refresh(manifest, true);
  assert.equal(refreshedStopped.state, "stopped");
  assert.equal(refreshedStopped.managed, false);
} finally {
  if (external.exitCode === null && external.signalCode === null) {
    external.kill("SIGKILL");
  }
}

// A different service on the declared port must fail preflight without the Hub
// spawning/killing anything on that port.
const wrongService = spawn(
  "node",
  [
    "-e",
    `require("http").createServer((req,res)=>{res.setHeader("content-type","application/json");res.end(JSON.stringify({protocol:"other-game/1"}));}).listen(19090,"127.0.0.1")`,
  ],
  { stdio: "ignore" },
);
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:19090/info");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 60));
  }
  assert.equal(ready, true);

  await assert.rejects(
    manager.prepareRound(manifest, round),
    /runtime-port-conflict/,
  );


  const conflict = manager.status(manifest);
  assert.equal(conflict.state, "failed");
  assert.equal(conflict.managed, false);
  assert.match(conflict.message ?? "", /unexpected service/);
  assert.match(conflict.message ?? "", /other-game\/1/);

  const stillThere = await fetch("http://127.0.0.1:19090/info").then((response) => response.json());
  assert.equal(stillThere.protocol, "other-game/1");
} finally {
  wrongService.kill("SIGTERM");
  await new Promise((resolvePromise) => wrongService.once("exit", resolvePromise));
}

delete process.env.RUNTIME_FIXTURE_DIR;
const bundled = manager.status(manifest);
assert.equal(bundled.configured, true);
assert.equal(bundled.configSource, "bundled");
assert.match(bundled.workingDirectory ?? "", /server\/test\/fixtures\/runtime$/);

const unconfiguredManifest = structuredClone(manifest);
delete unconfiguredManifest.runtime.workingDirectoryEnv;
delete unconfiguredManifest.runtime.bundledPath;
assert.equal(manager.status(unconfiguredManifest).state, "not-configured");

console.log("RuntimeManager smoke passed: warm lobby, bundled discovery, health refresh, unmanaged discovery, port preflight, start action, room code, and shutdown.");

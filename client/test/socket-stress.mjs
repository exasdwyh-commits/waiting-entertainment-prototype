import assert from "node:assert/strict";
import { io } from "socket.io-client";

const URL = "http://127.0.0.1:3001";
const PLAYER_COUNT = 10;
const INPUT_INTERVAL_MS = 50;

function connectSocket() {
  return new Promise((resolve, reject) => {
    const socket = io(URL, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, onEvent);
      resolve(payload);
    };

    socket.on(event, onEvent);
  });
}

function assertSnapshotHealthy(snapshot) {
  assert.equal(snapshot.players.length, PLAYER_COUNT);
  assert.equal(new Set(snapshot.players.map((player) => player.id)).size, PLAYER_COUNT);

  const grabbedTargets = snapshot.players
    .map((player) => player.grabTargetId)
    .filter(Boolean);
  assert.equal(
    new Set(grabbedTargets).size,
    grabbedTargets.length,
    "A target must not be carried by multiple holders.",
  );

  const ids = new Set(snapshot.players.map((player) => player.id));
  for (const player of snapshot.players) {
    assert.ok(player.position.every(Number.isFinite), `${player.id} position must stay finite`);
    assert.ok(player.rotation.every(Number.isFinite), `${player.id} rotation must stay finite`);
    assert.ok(player.velocity.every(Number.isFinite), `${player.id} velocity must stay finite`);
    assert.ok(Number.isFinite(player.balance));
    assert.ok(player.balance >= 0 && player.balance <= 1);
    assert.ok(Number.isFinite(player.stamina));
    assert.ok(player.stamina >= 0 && player.stamina <= 1);
    assert.ok(Number.isFinite(player.spawnProtectionLeftMs));
    assert.ok(player.spawnProtectionLeftMs >= 0);
    if (player.grabTargetId) {
      assert.ok(ids.has(player.grabTargetId));
      assert.notEqual(player.grabTargetId, player.id);
    }
  }
}

const observer = await connectSocket();
const players = [];
let overflow;
let inputTimer;
let latest;
let snapshotCount = 0;
let measuredStartedAt = 0;

try {
  observer.on("match:snapshot", (snapshot) => {
    latest = snapshot;
    assertSnapshotHealthy(snapshot);
    if (measuredStartedAt > 0 && performance.now() >= measuredStartedAt) {
      snapshotCount += 1;
    }
  });

  for (let index = 0; index < PLAYER_COUNT; index += 1) {
    const socket = await connectSocket();
    const ack = await new Promise((resolve) => {
      socket.emit(
        "join",
        {
          sessionId: `stress-session-${String(index).padStart(2, "0")}`,
          name: `Stress ${index + 1}`,
        },
        resolve,
      );
    });
    assert.equal(ack.ok, true);
    assert.ok(ack.playerId);
    const slotIndex = Number(String(ack.playerId).split("-")[1]);
    assert.ok(Number.isInteger(slotIndex));
    players.push({ socket, ack, seq: 0, index: slotIndex });
  }

  overflow = await connectSocket();
  const overflowAck = await new Promise((resolve) => {
    overflow.emit(
      "join",
      {
        sessionId: "stress-overflow-session",
        name: "Overflow",
      },
      resolve,
    );
  });
  assert.equal(overflowAck.ok, false);
  assert.equal(overflowAck.reason, "session-full");

  const allHuman = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) =>
      snapshot.phase === "playing" &&
      snapshot.players.length === PLAYER_COUNT &&
      snapshot.players.every((player) => player.bot === false),
    8000,
  );
  assertSnapshotHealthy(allHuman);

  measuredStartedAt = performance.now();
  snapshotCount = 0;

  // Drive every player radially outward. This deterministically exercises
  // edge hang -> fall -> pre-Final elimination -> respawn -> protection.
  inputTimer = setInterval(() => {
    for (const player of players) {
      const angle = (player.index / PLAYER_COUNT) * Math.PI * 2;
      player.seq += 1;
      player.socket.emit("input", {
        seq: player.seq,
        moveX: Math.cos(angle),
        moveY: Math.sin(angle),
        push: false,
        attack: false,
        grab: false,
        sprint: true,
      });
    }
  }, INPUT_INTERVAL_MS);

  const fell = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) =>
      snapshot.matchStage !== "final" &&
      snapshot.players.some((player) => player.eliminated),
    12_000,
  );
  const fallenIds = new Set(
    fell.players.filter((player) => player.eliminated).map((player) => player.id),
  );
  assert.ok(fallenIds.size > 0, "Stress run must force at least one pre-Final fall.");

  const protectedRespawn = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) =>
      snapshot.players.some(
        (player) =>
          fallenIds.has(player.id) &&
          !player.eliminated &&
          player.spawnProtectionLeftMs > 0,
      ),
    7000,
  );
  assertSnapshotHealthy(protectedRespawn);

  const protectedPlayer = protectedRespawn.players.find(
    (player) =>
      fallenIds.has(player.id) &&
      !player.eliminated &&
      player.spawnProtectionLeftMs > 0,
  );
  assert.ok(protectedPlayer);

  // After respawn, switch to a deterministic swirling brawl for concurrent
  // movement / sprint / punch / grab traffic from all ten phones.
  clearInterval(inputTimer);
  inputTimer = setInterval(() => {
    for (const player of players) {
      player.seq += 1;
      const t = player.seq * 0.19 + player.index * 0.63;
      player.socket.emit("input", {
        seq: player.seq,
        moveX: Math.cos(t),
        moveY: Math.sin(t),
        push: false,
        attack: player.seq % 7 === 0,
        grab: player.seq % 13 < 4,
        sprint: player.seq % 5 !== 0,
      });
    }
  }, INPUT_INTERVAL_MS);

  await new Promise((resolve) => setTimeout(resolve, 4500));
  clearInterval(inputTimer);
  inputTimer = undefined;

  assert.ok(latest);
  assertSnapshotHealthy(latest);
  assert.equal(latest.players.filter((player) => !player.bot).length, PLAYER_COUNT);
  assert.ok(
    snapshotCount >= 55,
    `Expected sustained snapshots under 10-client load, received ${snapshotCount}.`,
  );

  // Simultaneous disconnects must hand the same physical slots back to AI.
  const disconnected = players.slice(0, 3);
  const disconnectedIds = new Set(disconnected.map((player) => player.ack.playerId));
  for (const player of disconnected) player.socket.disconnect();

  const takeover = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) =>
      [...disconnectedIds].every((id) =>
        snapshot.players.some((player) => player.id === id && player.bot === true),
      ),
    5000,
  );
  assertSnapshotHealthy(takeover);

  console.log(
    `10-client stress passed: capacity -> 20Hz input load -> forced fall -> protected respawn -> concurrent brawl -> AI takeover; snapshots=${snapshotCount}.`,
  );
} finally {
  if (inputTimer) clearInterval(inputTimer);
  observer.disconnect();
  overflow?.disconnect();
  for (const player of players) player.socket.disconnect();
}

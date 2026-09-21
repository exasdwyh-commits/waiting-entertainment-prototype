import assert from "node:assert/strict";
import { io } from "socket.io-client";

const URL = "http://127.0.0.1:3001";

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 4000) {
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

const observer = await connectSocket();
const player = await connectSocket();
let recoveredPlayer;

try {
  const initial = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) => Array.isArray(snapshot?.players) && snapshot.players.length === 8,
  );

  assert.equal(initial.players.length, 8);
  assert.ok(initial.players.every((entry) => entry.bot === true));

  const joinAck = await new Promise((resolve) => {
    player.emit("join", { name: "CI Player" }, resolve);
  });

  assert.equal(joinAck.ok, true);
  assert.ok(joinAck.playerId);
  assert.ok(joinAck.sessionId);

  const controlled = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) =>
      snapshot.players.some(
        (entry) => entry.id === joinAck.playerId && entry.bot === false && entry.name === "CI Player",
      ),
  );

  const joinedPlayer = controlled.players.find((entry) => entry.id === joinAck.playerId);
  assert.equal(joinedPlayer.bot, false);

  player.emit("input", { moveX: 1, moveY: 0, push: true, seq: 1 });

  const afterInput = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) => snapshot.players.some((entry) => entry.id === joinAck.playerId),
  );

  assert.ok(afterInput.serverTimeMs > 0);
  assert.ok(Array.isArray(afterInput.events));

  player.disconnect();

  const handedBack = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) =>
      snapshot.players.some(
        (entry) => entry.id === joinAck.playerId && entry.bot === true,
      ),
  );

  const botAgain = handedBack.players.find((entry) => entry.id === joinAck.playerId);
  assert.equal(botAgain.bot, true);

  recoveredPlayer = await connectSocket();
  const recoverAck = await new Promise((resolve) => {
    recoveredPlayer.emit(
      "join",
      { sessionId: joinAck.sessionId, name: "CI Player" },
      resolve,
    );
  });

  assert.equal(recoverAck.ok, true);
  assert.equal(recoverAck.recovered, true);
  assert.equal(recoverAck.playerId, joinAck.playerId);

  const reclaimed = await waitForEvent(
    observer,
    "match:snapshot",
    (snapshot) =>
      snapshot.players.some(
        (entry) =>
          entry.id === joinAck.playerId &&
          entry.bot === false &&
          entry.name === "CI Player",
      ),
  );

  const humanAgain = reclaimed.players.find((entry) => entry.id === joinAck.playerId);
  assert.equal(humanAgain.bot, false);

  console.log(
    "Socket E2E passed: join -> authoritative input -> Bot takeover -> stable-session recovery.",
  );
} finally {
  observer.disconnect();
  player.disconnect();
  recoveredPlayer?.disconnect();
}

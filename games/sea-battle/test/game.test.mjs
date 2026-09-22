import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPACITY,
  ROUND_SECONDS,
  UPGRADE_IDS,
  applyInput,
  chooseUpgrade,
  makeGame,
  ranking,
  startGame,
  stepGame,
} from "../game.mjs";

function running(seed = 7) {
  const state = makeGame({ seed });
  startGame(state);
  for (let i = 0; i < 130; i++) stepGame(state, 1 / 30);
  assert.equal(state.phase, "racing");
  return state;
}

function humanize(state) {
  for (const boat of state.boats) {
    boat.human = true;
    boat.connected = true;
    boat.steer = 0;
    boat.throttle = false;
    boat.speed = 0;
  }
}

test("Sea Battle starts as an eight-slot, three-minute authoritative game", () => {
  const state = makeGame();
  assert.equal(state.boats.length, CAPACITY);
  assert.equal(state.seconds, ROUND_SECONDS);
  assert.equal(state.crates.length, 22);
  assert.equal(state.protocol, "sea-battle/1");
});

test("left steering plus right throttle input is bounded and server-owned", () => {
  const state = running();
  const boat = state.boats[0];
  assert.equal(applyInput(boat, { steer: 0.75, throttle: true }), true);
  stepGame(state, 0.2);
  assert.ok(boat.speed > 0);
  assert.ok(boat.energy < boat.maxEnergy);
  assert.equal(applyInput(boat, { steer: 2, throttle: true }), false);
});

test("three resource pickups produce a unique three-choice level-up", () => {
  const state = running();
  humanize(state);
  const boat = state.boats[0];
  for (let i = 0; i < 3; i++) {
    const crate = state.crates[i];
    crate.active = true;
    crate.x = boat.x;
    crate.z = boat.z;
    stepGame(state, 1 / 60);
  }
  assert.equal(boat.level, 2);
  assert.equal(boat.choices.length, 3);
  assert.equal(new Set(boat.choices).size, 3);
  assert.ok(boat.choices.every((id) => UPGRADE_IDS.includes(id)));
});

test("upgrade choices apply exactly once and clear the choice panel", () => {
  const state = running();
  const boat = state.boats[0];
  boat.choices = ["cannons", "hp", "speed"];
  const before = boat.cannonCount;
  assert.equal(chooseUpgrade(state, boat.id, "cannons"), true);
  assert.equal(boat.cannonCount, before + 1);
  assert.deepEqual(boat.choices, []);
  assert.equal(chooseUpgrade(state, boat.id, "hp"), false);
});

test("automatic cannons fire broadside but do not shoot through the bow", () => {
  const sideState = running(11);
  humanize(sideState);
  sideState.boats.forEach((boat, id) => {
    boat.x = id * 3 + 40;
    boat.z = 40;
    boat.heading = 0;
    if (id > 1) { boat.alive = false; boat.respawnAt = Infinity; }
  });
  sideState.projectiles = [];
  const shooter = sideState.boats[0];
  const target = sideState.boats[1];
  shooter.x = 0; shooter.z = 0; shooter.heading = 0; shooter.nextFireAt = 0;
  target.x = 10; target.z = 0;
  stepGame(sideState, 1 / 30);
  assert.ok(sideState.projectiles.length > 0, "target on starboard broadside triggers fire");

  const frontState = running(12);
  humanize(frontState);
  frontState.boats.forEach((boat, id) => {
    boat.x = 42 + id;
    boat.z = 42;
    boat.heading = 0;
    if (id > 1) { boat.alive = false; boat.respawnAt = Infinity; }
  });
  frontState.projectiles = [];
  const bow = frontState.boats[0];
  const ahead = frontState.boats[1];
  bow.x = 0; bow.z = 0; bow.heading = 0; bow.nextFireAt = 0;
  ahead.x = 0; ahead.z = 10;
  stepGame(frontState, 1 / 30);
  assert.equal(frontState.projectiles.length, 0, "target directly ahead is not a broadside solution");
});

test("sinking scores the killer and victim respawns without ending the round", () => {
  const state = running(22);
  humanize(state);
  const attacker = state.boats[0];
  const victim = state.boats[1];
  attacker.x = -4; attacker.z = 0;
  victim.x = 0; victim.z = 0; victim.hp = 5;
  state.projectiles.push({
    id: ++state.projectileId,
    ownerId: attacker.id,
    x: victim.x,
    z: victim.z,
    vx: 0,
    vz: 0,
    damage: 20,
    radius: 0.3,
    bornAt: state.time,
    life: 2,
    alive: true,
  });
  stepGame(state, 1 / 60);
  assert.equal(victim.alive, false);
  assert.equal(attacker.kills, 1);
  assert.ok(attacker.score >= 10);

  const respawnAt = victim.respawnAt;
  while (state.time < respawnAt + 0.05) stepGame(state, 1 / 30);
  assert.equal(victim.alive, true);
  assert.equal(victim.hp, victim.maxHp);
  assert.ok(victim.invulnerableUntil > state.time);
});

test("deep-sea monster enters mid-match and telegraphs attacks", () => {
  const state = running(31);
  humanize(state);
  state.time = state.nextMonsterAt - 0.02;
  stepGame(state, 0.05);
  assert.ok(state.monster?.alive);
  assert.ok(state.events.some((event) => event.type === "monster_spawn"));

  state.monster.nextAttackAt = state.time;
  stepGame(state, 0.05);
  assert.ok(state.monster.attack, "monster creates a visible warning zone before damage");
});

test("round ends by score after the clock expires", () => {
  const state = running(45);
  humanize(state);
  state.boats[3].score = 99;
  state.remaining = 0.01;
  stepGame(state, 0.05);
  assert.equal(state.phase, "result");
  assert.equal(state.winnerId, 3);
  assert.equal(ranking(state)[0].id, 3);
});

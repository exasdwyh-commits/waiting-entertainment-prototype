import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPACITY,
  ROUND_SECONDS,
  UPGRADE_IDS,
  applyInput,
  battleStage,
  chooseUpgrade,
  currentBountyId,
  makeGame,
  ranking,
  safeRadius,
  snapshot,
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

test("ship collisions separate overlapping hulls and exchange shove", () => {
  const state = running(77);
  humanize(state);
  state.projectiles = [];
  const [a, b] = state.boats;
  for (const boat of state.boats.slice(2)) {
    boat.alive = false;
    boat.respawnAt = Infinity;
  }
  a.x = 0; a.z = 0; a.heading = Math.PI / 2; a.speed = 12;
  b.x = 0.5; b.z = 0; b.heading = -Math.PI / 2; b.speed = 8;
  const before = Math.hypot(a.x - b.x, a.z - b.z);
  stepGame(state, 1 / 30);
  const after = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(after > before, "overlapping hulls are physically separated");
  assert.ok(Math.abs(a.knockX) + Math.abs(a.knockZ) > 0);
  assert.ok(Math.abs(b.knockX) + Math.abs(b.knockZ) > 0);
  assert.ok(state.events.some((event) => event.type === "collision"));
});

test("cannon hits create physical knockback and snapshot muzzle metadata", () => {
  const state = running(78);
  humanize(state);
  for (const boat of state.boats.slice(2)) {
    boat.alive = false;
    boat.respawnAt = Infinity;
  }
  const [attacker, victim] = state.boats;
  attacker.x = 0; attacker.z = 0; attacker.heading = 0; attacker.nextFireAt = 0;
  victim.x = 8; victim.z = 0; victim.heading = 0;
  state.projectiles = [];
  stepGame(state, 1 / 30);
  assert.ok(attacker.lastFireAt > -Infinity);
  assert.equal(attacker.lastFireSide, 1);
  for (let i = 0; i < 20; i++) stepGame(state, 1 / 60);
  assert.ok(victim.lastHitAt > -Infinity, "victim records authoritative hit time");
  assert.ok(Math.hypot(victim.knockX, victim.knockZ) > 0.05, "hit displaces the hull");
});

test("three-minute pacing transitions from salvage to battle to maelstrom", () => {
  const state = makeGame({ seconds: 180 });
  state.phase = "racing";

  state.remaining = 170;
  assert.equal(battleStage(state), "salvage");
  assert.equal(safeRadius(state), 58);

  state.remaining = 120;
  assert.equal(battleStage(state), "battle");
  assert.ok(safeRadius(state) < 58 && safeRadius(state) >= 54);

  state.remaining = 45;
  assert.equal(battleStage(state), "maelstrom");
  assert.ok(safeRadius(state) < 54 && safeRadius(state) > 38);

  state.remaining = 0;
  assert.equal(safeRadius(state), 38);
});

test("stage transitions emit explicit battle events", () => {
  const state = running(91);
  humanize(state);
  state.remaining = state.seconds * 0.75 + 0.01;
  state.stage = "salvage";
  stepGame(state, 0.02);
  assert.equal(state.stage, "battle");
  assert.ok(state.events.some((event) => event.type === "stage" && event.stage === "battle"));

  state.remaining = state.seconds * 0.30 + 0.01;
  state.stage = "battle";
  stepGame(state, 0.02);
  assert.equal(state.stage, "maelstrom");
  assert.ok(state.events.some((event) => event.type === "stage" && event.stage === "maelstrom"));
});

test("maelstrom damages and pushes ships back toward the shrinking safe sea", () => {
  const state = running(92);
  humanize(state);
  for (const boat of state.boats.slice(1)) {
    boat.alive = false;
    boat.respawnAt = Infinity;
  }
  const boat = state.boats[0];
  state.remaining = state.seconds * 0.20;
  state.stage = "maelstrom";
  boat.x = 56;
  boat.z = 0;
  boat.hp = boat.maxHp;
  boat.energy = boat.maxEnergy;
  boat.invulnerableUntil = 0;
  const hp = boat.hp;
  const energy = boat.energy;

  stepGame(state, 0.5);

  assert.equal(battleStage(state), "maelstrom");
  assert.ok(boat.hp < hp, "storm deals authoritative hull damage");
  assert.ok(boat.energy < energy, "storm drains boost energy");
  assert.ok(boat.knockX < 0, "storm pushes an east-side ship back toward center");
  assert.ok(state.events.some((event) => event.type === "storm"));
});

test("late-round respawned supplies stay inside the active safe sea", () => {
  const state = running(93);
  humanize(state);
  state.remaining = state.seconds * 0.12;
  state.stage = "maelstrom";
  const crate = state.crates[0];
  crate.active = false;
  crate.respawnAt = state.time;
  stepGame(state, 1 / 30);

  assert.equal(crate.active, true);
  assert.ok(
    Math.hypot(crate.x, crate.z) <= safeRadius(state) - 5.5,
    "supply does not respawn outside the shrinking combat zone",
  );
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


test("leader bounty creates a comeback target and streak bonuses reward consecutive sinks", () => {
  const state = running(121);
  humanize(state);
  for (const boat of state.boats) {
    boat.x = 40 + boat.id;
    boat.z = 40;
    boat.hp = boat.maxHp;
  }
  const attacker = state.boats[0];
  const leader = state.boats[1];
  const secondVictim = state.boats[2];
  attacker.score = 2;
  leader.score = 20;
  leader.hp = 5;
  assert.equal(currentBountyId(state), leader.id);

  state.projectiles.push({
    id: ++state.projectileId, ownerId: attacker.id,
    x: leader.x, z: leader.z, vx: 0, vz: 0,
    damage: 20, radius: 0.3, bornAt: state.time, life: 2, alive: true,
  });
  stepGame(state, 1 / 120);
  assert.equal(leader.alive, false);
  assert.equal(attacker.bountyKills, 1);
  assert.equal(attacker.killStreak, 1);
  assert.equal(attacker.score, 20, "hit + sink + bounty are all authoritative score");
  assert.ok(state.events.some((event) => event.type === "bounty_sink"));

  secondVictim.hp = 5;
  state.projectiles.push({
    id: ++state.projectileId, ownerId: attacker.id,
    x: secondVictim.x, z: secondVictim.z, vx: 0, vz: 0,
    damage: 20, radius: 0.3, bornAt: state.time, life: 2, alive: true,
  });
  stepGame(state, 1 / 120);
  assert.equal(attacker.killStreak, 2);
  assert.equal(attacker.bestStreak, 2);
  assert.ok(attacker.score >= 30, "second consecutive sink receives streak bonus");

  attacker.killStreak = 3;
  attacker.hp = 1;
  state.projectiles.push({
    id: ++state.projectileId, ownerId: secondVictim.id,
    x: attacker.x, z: attacker.z, vx: 0, vz: 0,
    damage: 20, radius: 0.3, bornAt: state.time, life: 2, alive: true,
  });
  secondVictim.alive = true;
  secondVictim.invulnerableUntil = 0;
  stepGame(state, 1 / 120);
  assert.equal(attacker.killStreak, 0, "being sunk resets the current streak");
});

test("snapshot exposes bounty and streak state for phone and broadcast UI", () => {
  const state = running(122);
  humanize(state);
  state.boats[3].score = 12;
  state.boats[3].killStreak = 2;
  const snap = snapshot(state);
  assert.equal(snap.bountyId, 3);
  assert.equal(snap.boats[3].killStreak, 2);
  assert.equal(snap.boats[3].bestStreak, 0);
});


test("fatal hit preserves the bounty target that was marked before hit score changes ranking", () => {
  const state = running(123);
  humanize(state);
  for (const boat of state.boats) {
    boat.x = 35 + boat.id;
    boat.z = 35;
    boat.hp = boat.maxHp;
    if (boat.id > 1) {
      boat.alive = false;
      boat.respawnAt = Infinity;
    }
  }
  const attacker = state.boats[0];
  const leader = state.boats[1];
  attacker.x = -20;
  attacker.z = 0;
  leader.x = 0;
  leader.z = 0;
  leader.invulnerableUntil = 0;
  attacker.score = 7;
  leader.score = 8;
  leader.hp = 5;
  assert.equal(currentBountyId(state), leader.id);

  state.projectiles.push({
    id: ++state.projectileId, ownerId: attacker.id,
    x: leader.x, z: leader.z, vx: 0, vz: 0,
    damage: 20, radius: 0.3, bornAt: state.time, life: 2, alive: true,
  });
  // Tiny tick isolates projectile resolution from auto-forward movement and
  // hull collision correction while still exercising the real step order.
  stepGame(state, 1e-6);

  assert.equal(leader.alive, false);
  assert.equal(attacker.bountyKills, 1);
  assert.equal(attacker.score, 25, "7 + hit 2 + sink 10 + bounty 6");
  assert.ok(state.events.some((event) =>
    event.type === "bounty_sink" && event.boatId === leader.id
  ));
});

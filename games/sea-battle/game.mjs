export const CAPACITY = 8;
export const ROUND_SECONDS = 180;
export const WORLD_RADIUS = 58;
export const CRATE_COUNT = 22;
export const CRATE_MAGNET_RADIUS = 8;
export const PROJECTILE_SPEED = 31;
export const RESPAWN_SECONDS = 3;
export const RESPAWN_INVULN = 1.6;
export const MONSTER_FIRST_AT = 32;
export const MONSTER_RESPAWN = 38;

export const BATTLE_STAGES = {
  salvage: { from: 0, label: "物资争夺" },
  battle: { from: 0.25, label: "炮火升级" },
  maelstrom: { from: 0.70, label: "风暴决战" },
};

export const UPGRADE_DEFS = {
  speed: { label: "疾风船体", desc: "基础速度与加速上限提高" },
  cannons: { label: "追加火炮", desc: "每次侧舷齐射增加一枚炮弹" },
  energy: { label: "能量舱", desc: "加速能量上限与回复提高" },
  attack: { label: "重炮弹药", desc: "炮弹伤害提高" },
  fireRate: { label: "快速装填", desc: "侧舷炮攻击间隔缩短" },
  hp: { label: "强化船壳", desc: "最大生命提高并立即修复" },
  size: { label: "旗舰扩建", desc: "体型、耐久与炮击威力小幅提高" },
};
export const UPGRADE_IDS = Object.keys(UPGRADE_DEFS);

const COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#a855f7",
  "#14b8a6", "#f59e0b", "#64748b", "#ec4899",
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist2 = (a, b) => {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
};
const normAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function battleProgress(state) {
  const seconds = Math.max(1, Number(state?.seconds) || ROUND_SECONDS);
  return clamp(1 - (Number(state?.remaining) || 0) / seconds, 0, 1);
}

export function battleStage(state) {
  const progress = battleProgress(state);
  if (progress >= BATTLE_STAGES.maelstrom.from) return "maelstrom";
  if (progress >= BATTLE_STAGES.battle.from) return "battle";
  return "salvage";
}

export function safeRadius(state) {
  const progress = battleProgress(state);
  if (progress < BATTLE_STAGES.battle.from) return WORLD_RADIUS;
  if (progress < BATTLE_STAGES.maelstrom.from) {
    const local = (progress - BATTLE_STAGES.battle.from) /
      (BATTLE_STAGES.maelstrom.from - BATTLE_STAGES.battle.from);
    return WORLD_RADIUS - local * 4;
  }
  const local = (progress - BATTLE_STAGES.maelstrom.from) /
    (1 - BATTLE_STAGES.maelstrom.from);
  return 54 - clamp(local, 0, 1) * 16;
}

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

function randomPoint(state, minRadius = 8, maxRadius = WORLD_RADIUS - 6) {
  const angle = random(state) * Math.PI * 2;
  const radius = minRadius + Math.sqrt(random(state)) * (maxRadius - minRadius);
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function spawnPoint(id) {
  const angle = id / CAPACITY * Math.PI * 2;
  const radius = 24 + (id % 2) * 4;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    heading: normAngle(-angle + Math.PI / 2),
  };
}

export function newBoat(id) {
  const spawn = spawnPoint(id);
  return {
    id,
    name: `船长 ${String(id + 1).padStart(2, "0")}`,
    color: COLORS[id % COLORS.length],
    human: false,
    connected: false,
    ready: false,
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading,
    steer: 0,
    throttle: false,
    speed: 0,
    knockX: 0,
    knockZ: 0,
    baseSpeed: 7.5,
    boostSpeed: 15,
    turnRate: 1.95,
    hp: 100,
    maxHp: 100,
    damage: 18,
    fireInterval: 1.25,
    cannonCount: 1,
    nextFireAt: 0,
    radius: 1.15,
    energy: 80,
    maxEnergy: 80,
    energyRegen: 11,
    level: 1,
    xp: 0,
    nextLevelXp: 3,
    choices: [],
    score: 0,
    kills: 0,
    deaths: 0,
    alive: true,
    respawnAt: 0,
    invulnerableUntil: 0,
    lastHitBy: null,
    lastHitAt: -Infinity,
    lastFireAt: -Infinity,
    lastFireSide: 0,
    lastCollisionAt: -Infinity,
    lastStormAt: -Infinity,
    killStreak: 0,
    bestStreak: 0,
    bountyKills: 0,
  };
}

function makeCrate(state, id) {
  const p = randomPoint(state, 6, WORLD_RADIUS - 8);
  return { id, x: p.x, z: p.z, active: true, respawnAt: 0 };
}

export function makeGame(options = {}) {
  const state = {
    protocol: "sea-battle/1",
    phase: "demo",
    round: 0,
    time: 0,
    remaining: Number.isFinite(options.seconds) ? options.seconds : ROUND_SECONDS,
    seconds: Number.isFinite(options.seconds) ? options.seconds : ROUND_SECONDS,
    countdown: 0,
    rng: Number.isSafeInteger(options.seed) ? options.seed >>> 0 : 0x5ea2026,
    boats: [],
    crates: [],
    projectiles: [],
    projectileId: 0,
    events: [],
    eventId: 0,
    monster: null,
    nextMonsterAt: MONSTER_FIRST_AT,
    stage: "salvage",
    winnerId: null,
  };
  state.boats = Array.from({ length: CAPACITY }, (_, id) => newBoat(id));
  state.crates = Array.from({ length: CRATE_COUNT }, (_, id) => makeCrate(state, id));
  return state;
}

function emit(state, type, boatId, text, priority = 1, data = {}) {
  state.events.unshift({
    id: ++state.eventId,
    type,
    boatId,
    text,
    priority,
    time: Math.round(state.time * 1000) / 1000,
    ...data,
  });
  state.events.length = Math.min(state.events.length, 12);
}

function updateBattleStage(state) {
  const next = battleStage(state);
  if (next === state.stage) return;
  state.stage = next;
  if (next === "battle") {
    emit(state, "stage", null, "炮火升级：追击敌舰，侧舷齐射！", 4, { stage: next });
  } else if (next === "maelstrom") {
    emit(state, "stage", null, "风暴决战：安全海域开始收缩！", 5, { stage: next });
  }
}

export function startGame(state) {
  state.round += 1;
  state.time = 0;
  state.phase = "countdown";
  state.countdown = 4;
  state.remaining = state.seconds;
  state.projectiles = [];
  state.monster = null;
  state.nextMonsterAt = MONSTER_FIRST_AT;
  state.stage = "salvage";
  state.winnerId = null;
  state.events = [];
  for (const boat of state.boats) {
    const keep = {
      name: boat.name,
      human: boat.human,
      connected: boat.connected,
      ready: boat.ready,
    };
    Object.assign(boat, newBoat(boat.id), keep);
  }
  for (const crate of state.crates) {
    const p = randomPoint(state, 6, Math.max(18, safeRadius(state) - 6));
    Object.assign(crate, { x: p.x, z: p.z, active: true, respawnAt: 0 });
  }
}

export function applyInput(boat, input) {
  if (!boat || !boat.alive) return false;
  const steer = Number(input?.steer);
  if (!Number.isFinite(steer) || Math.abs(steer) > 1 || typeof input?.throttle !== "boolean") {
    return false;
  }
  boat.steer = steer;
  boat.throttle = input.throttle;
  return true;
}

function pickChoices(state) {
  const pool = [...UPGRADE_IDS];
  const choices = [];
  while (choices.length < 3 && pool.length) {
    const index = Math.floor(random(state) * pool.length);
    choices.push(pool.splice(index, 1)[0]);
  }
  return choices;
}

function grantXp(state, boat, amount = 1) {
  boat.xp += amount;
  while (boat.xp >= boat.nextLevelXp && boat.level < 12 && boat.choices.length === 0) {
    boat.xp -= boat.nextLevelXp;
    boat.level += 1;
    boat.nextLevelXp = Math.min(9, 2 + boat.level);
    boat.choices = pickChoices(state);
    emit(state, "level_up", boat.id, `${boat.name} 升到 Lv.${boat.level}`, 2, {
      choices: [...boat.choices],
    });
  }
}

export function chooseUpgrade(state, boatId, upgradeId) {
  const boat = state.boats[boatId];
  if (!boat || !boat.choices.includes(upgradeId) || !UPGRADE_DEFS[upgradeId]) return false;

  switch (upgradeId) {
    case "speed":
      boat.baseSpeed += 0.8;
      boat.boostSpeed += 1.35;
      break;
    case "cannons":
      boat.cannonCount = Math.min(4, boat.cannonCount + 1);
      break;
    case "energy":
      boat.maxEnergy += 22;
      boat.energyRegen += 1.8;
      boat.energy = boat.maxEnergy;
      break;
    case "attack":
      boat.damage += 5.5;
      break;
    case "fireRate":
      boat.fireInterval = Math.max(0.5, boat.fireInterval * 0.86);
      break;
    case "hp":
      boat.maxHp += 25;
      boat.hp = Math.min(boat.maxHp, boat.hp + 32);
      break;
    case "size":
      boat.radius = Math.min(1.85, boat.radius + 0.13);
      boat.maxHp += 10;
      boat.hp += 10;
      boat.damage += 2;
      break;
  }

  boat.choices = [];
  emit(state, "upgrade", boat.id, `${boat.name} 获得「${UPGRADE_DEFS[upgradeId].label}」`, 2, {
    upgradeId,
  });
  return true;
}

function nearestCrate(state, boat) {
  let best = null, bestD = Infinity;
  for (const crate of state.crates) {
    if (!crate.active) continue;
    const d = dist2(boat, crate);
    if (d < bestD) {
      bestD = d;
      best = crate;
    }
  }
  return best;
}

function nearestEnemy(state, boat, maxRange = 24) {
  let best = null, bestD = maxRange * maxRange;
  for (const other of state.boats) {
    if (other.id === boat.id || !other.alive) continue;
    const d = dist2(boat, other);
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  return best;
}

function aiInput(state, boat) {
  if (boat.choices.length) {
    const priority = ["cannons", "fireRate", "attack", "speed", "hp", "energy", "size"];
    const choice = priority.find((id) => boat.choices.includes(id)) ?? boat.choices[0];
    chooseUpgrade(state, boat.id, choice);
  }

  const stage = state.phase === "racing" ? battleStage(state) : "salvage";
  const enemyRange = stage === "salvage" ? 11 : stage === "battle" ? 24 : 34;
  const enemy = nearestEnemy(state, boat, enemyRange);
  const crate = nearestCrate(state, boat);
  const target =
    stage === "salvage"
      ? (enemy ?? crate)
      : stage === "battle"
        ? (enemy ?? crate)
        : (enemy ?? { x: 0, z: 0 });

  if (!target) {
    boat.steer = Math.sin(state.time * 0.45 + boat.id) * 0.35;
    boat.throttle = boat.energy > 18;
    return;
  }

  const desired = Math.atan2(target.x - boat.x, target.z - boat.z);
  let delta = normAngle(desired - boat.heading);

  // When close to an enemy, orbit it so the broadside rather than the bow
  // naturally faces the target.
  if (enemy) {
    const orbit = boat.id % 2 ? Math.PI / 2 : -Math.PI / 2;
    delta = normAngle(desired + orbit - boat.heading);
  }

  boat.steer = clamp(delta / 0.9, -1, 1);
  boat.throttle = boat.energy > 12 || Math.abs(delta) < 0.4;
}

function fireBroadside(state, boat) {
  if (state.time < boat.nextFireAt || !boat.alive) return false;
  const forward = { x: Math.sin(boat.heading), z: Math.cos(boat.heading) };
  const right = { x: Math.cos(boat.heading), z: -Math.sin(boat.heading) };

  let best = null;
  const candidates = state.boats
    .filter((other) => other.id !== boat.id && other.alive)
    .map((target) => ({ kind: "boat", target }));

  if (state.monster?.alive) candidates.push({ kind: "monster", target: state.monster });

  for (const candidate of candidates) {
    const dx = candidate.target.x - boat.x;
    const dz = candidate.target.z - boat.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 31 || distance < 2) continue;
    const nx = dx / distance, nz = dz / distance;
    const sideDot = nx * right.x + nz * right.z;
    const forwardDot = nx * forward.x + nz * forward.z;
    if (Math.abs(sideDot) < 0.7 || Math.abs(forwardDot) > 0.72) continue;
    if (!best || distance < best.distance) best = { ...candidate, distance, side: Math.sign(sideDot) || 1 };
  }

  if (!best) return false;

  const rightSign = best.side;
  boat.nextFireAt = state.time + boat.fireInterval;
  boat.lastFireAt = state.time;
  boat.lastFireSide = rightSign;
  // Broadside recoil is small but visible: firing a heavy battery should feel
  // like mass moved, not like a UI-only damage tick.
  boat.knockX -= right.x * rightSign * (0.35 + boat.cannonCount * 0.08);
  boat.knockZ -= right.z * rightSign * (0.35 + boat.cannonCount * 0.08);
  const count = boat.cannonCount;
  const baseAngle = boat.heading + rightSign * Math.PI / 2;

  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.075;
    const angle = baseAngle + spread;
    const barrelOffset = (i - (count - 1) / 2) * Math.min(0.72, boat.radius * 0.4);
    state.projectiles.push({
      id: ++state.projectileId,
      ownerId: boat.id,
      x: boat.x + right.x * rightSign * (boat.radius + 0.5) + forward.x * barrelOffset,
      z: boat.z + right.z * rightSign * (boat.radius + 0.5) + forward.z * barrelOffset,
      vx: Math.sin(angle) * PROJECTILE_SPEED,
      vz: Math.cos(angle) * PROJECTILE_SPEED,
      damage: boat.damage,
      radius: 0.28 + boat.cannonCount * 0.025,
      bornAt: state.time,
      life: 1.45,
      alive: true,
    });
  }

  emit(state, "broadside", boat.id, `${boat.name} 侧舷齐射`, 1, {
    targetKind: best.kind,
    targetId: best.kind === "boat" ? best.target.id : null,
  });
  return true;
}

export function currentBountyId(state) {
  if (state.phase !== "racing") return null;
  const order = ranking(state).filter((boat) => boat.alive);
  const leader = order[0];
  if (!leader || leader.score < 8) return null;
  return leader.id;
}

function sinkBoat(state, victim, killerId, bountyIdAtImpact = null) {
  if (!victim.alive) return;
  const bountyId = Number.isInteger(bountyIdAtImpact)
    ? bountyIdAtImpact
    : currentBountyId(state);
  victim.alive = false;
  victim.deaths += 1;
  victim.speed = 0;
  victim.respawnAt = state.time + RESPAWN_SECONDS;
  victim.choices = [];
  const killer = Number.isInteger(killerId) ? state.boats[killerId] : null;
  victim.killStreak = 0;
  let bountyBonus = 0;
  let streakBonus = 0;
  if (killer && killer.id !== victim.id) {
    killer.kills += 1;
    killer.killStreak += 1;
    killer.bestStreak = Math.max(killer.bestStreak, killer.killStreak);
    streakBonus = Math.min(4, Math.max(0, killer.killStreak - 1) * 2);
    if (victim.id === bountyId) {
      bountyBonus = 6;
      killer.bountyKills += 1;
    }
    killer.score += 10 + streakBonus + bountyBonus;
    grantXp(state, killer, 1);
  }
  const extras = [
    bountyBonus ? "悬赏 +6" : "",
    streakBonus ? `连沉 +${streakBonus}` : "",
  ].filter(Boolean).join(" · ");
  emit(state, bountyBonus ? "bounty_sink" : "sink", victim.id,
    killer
      ? `${killer.name} 击沉 ${victim.name}${extras ? ` · ${extras}` : ""}`
      : `${victim.name} 沉没`,
    bountyBonus ? 5 : 4,
    {
      killerId: killer?.id ?? null,
      bountyBonus,
      streakBonus,
      killStreak: killer?.killStreak ?? 0,
    },
  );
}

function respawnBoat(state, boat) {
  const spawn = spawnPoint(boat.id + state.round);
  boat.x = spawn.x;
  boat.z = spawn.z;
  boat.heading = spawn.heading;
  boat.speed = 0;
  boat.hp = boat.maxHp;
  boat.energy = boat.maxEnergy;
  boat.alive = true;
  boat.invulnerableUntil = state.time + RESPAWN_INVULN;
  boat.lastHitBy = null;
  emit(state, "respawn", boat.id, `${boat.name} 重返海面`, 1);
}

function spawnMonster(state) {
  const p = randomPoint(state, 20, 34);
  state.monster = {
    x: p.x,
    z: p.z,
    hp: 260,
    maxHp: 260,
    radius: 3.8,
    alive: true,
    nextAttackAt: state.time + 3.5,
    attack: null,
    lastHitBy: null,
  };
  emit(state, "monster_spawn", null, "深海巨兽闯入战场！", 5);
}

function stepMonster(state, dt) {
  const monster = state.monster;
  if (!monster?.alive) {
    if (state.phase === "racing" && state.time >= state.nextMonsterAt) spawnMonster(state);
    return;
  }

  const alive = state.boats.filter((boat) => boat.alive);
  if (!alive.length) return;
  const leader = [...alive].sort((a, b) => b.score - a.score || b.level - a.level)[0];

  const dx = leader.x - monster.x, dz = leader.z - monster.z;
  const distance = Math.hypot(dx, dz) || 1;
  monster.x += dx / distance * dt * 2.2;
  monster.z += dz / distance * dt * 2.2;

  if (!monster.attack && state.time >= monster.nextAttackAt) {
    monster.attack = {
      x: leader.x,
      z: leader.z,
      strikeAt: state.time + 0.9,
      radius: 8.5,
    };
    monster.nextAttackAt = state.time + (battleStage(state) === "maelstrom" ? 3.25 : 4.5);
    emit(state, "monster_warning", leader.id, `海怪锁定 ${leader.name}`, 3);
  }

  if (monster.attack && state.time >= monster.attack.strikeAt) {
    const attack = monster.attack;
    monster.attack = null;
    for (const boat of alive) {
      if (state.time < boat.invulnerableUntil) continue;
      const dx2 = boat.x - attack.x, dz2 = boat.z - attack.z;
      if (dx2 * dx2 + dz2 * dz2 <= attack.radius * attack.radius) {
        boat.hp -= 24;
        boat.lastHitBy = null;
        boat.lastHitAt = state.time;
        const pushX = boat.x - attack.x, pushZ = boat.z - attack.z;
        const pushLen = Math.hypot(pushX, pushZ) || 1;
        boat.knockX += pushX / pushLen * 5.2;
        boat.knockZ += pushZ / pushLen * 5.2;
        emit(state, "monster_hit", boat.id, `${boat.name} 被巨兽掀翻`, 3);
        if (boat.hp <= 0) sinkBoat(state, boat, null);
      }
    }
  }
}

function stepProjectiles(state, dt) {
  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    projectile.x += projectile.vx * dt;
    projectile.z += projectile.vz * dt;
    if (state.time - projectile.bornAt > projectile.life ||
        Math.hypot(projectile.x, projectile.z) > WORLD_RADIUS + 12) {
      projectile.alive = false;
      continue;
    }

    for (const boat of state.boats) {
      if (!boat.alive || boat.id === projectile.ownerId || state.time < boat.invulnerableUntil) continue;
      const rr = boat.radius + projectile.radius;
      if (dist2(projectile, boat) > rr * rr) continue;
      projectile.alive = false;
      boat.hp -= projectile.damage;
      boat.lastHitBy = projectile.ownerId;
      boat.lastHitAt = state.time;
      const impulse = 2.8 + projectile.damage * 0.055;
      const projectileSpeed = Math.hypot(projectile.vx, projectile.vz) || 1;
      boat.knockX += projectile.vx / projectileSpeed * impulse;
      boat.knockZ += projectile.vz / projectileSpeed * impulse;
      // Lock bounty identity before the +2 hit score mutates ranking. A
      // killing shot must pay the target that was visibly marked when it hit.
      const bountyIdAtImpact = currentBountyId(state);
      const attacker = state.boats[projectile.ownerId];
      if (attacker) attacker.score += 2;
      emit(state, "hit", boat.id, `${attacker?.name ?? "炮弹"} 命中 ${boat.name}`, 2, {
        attackerId: projectile.ownerId,
      });
      if (boat.hp <= 0) sinkBoat(state, boat, projectile.ownerId, bountyIdAtImpact);
      break;
    }

    const monster = state.monster;
    if (projectile.alive && monster?.alive) {
      const rr = monster.radius + projectile.radius;
      if (dist2(projectile, monster) <= rr * rr) {
        projectile.alive = false;
        monster.hp -= projectile.damage;
        monster.lastHitBy = projectile.ownerId;
        const attacker = state.boats[projectile.ownerId];
        if (attacker) attacker.score += 1;
        if (monster.hp <= 0) {
          monster.alive = false;
          const killer = state.boats[projectile.ownerId];
          if (killer) {
            killer.score += 25;
            grantXp(state, killer, 2);
          }
          state.nextMonsterAt = state.time + MONSTER_RESPAWN;
          emit(state, "monster_kill", projectile.ownerId,
            `${killer?.name ?? "船队"} 击退深海巨兽！`, 5);
        }
      }
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
}

function collectCrate(state, boat, crate) {
  crate.active = false;
  crate.respawnAt = state.time + 7;
  boat.score += 2;
  grantXp(state, boat, 1);
  boat.hp = Math.min(boat.maxHp, boat.hp + 6);
  boat.energy = Math.min(boat.maxEnergy, boat.energy + 12);
  emit(state, "crate", boat.id, `${boat.name} 获得海上物资`, 1, { crateId: crate.id });
}

function collectCrates(state, boat) {
  for (const crate of state.crates) {
    if (crate.active && dist2(boat, crate) <= (boat.radius + 1.0) ** 2) {
      collectCrate(state, boat, crate);
    }
  }
}

function stepCrates(state, dt) {
  for (const crate of state.crates) {
    if (!crate.active) {
      if (state.time < crate.respawnAt) continue;
      const p = randomPoint(state, 6, Math.max(18, safeRadius(state) - 6));
      crate.x = p.x;
      crate.z = p.z;
      crate.active = true;
      continue;
    }

    let nearest = null;
    let nearestDistance = CRATE_MAGNET_RADIUS;
    for (const boat of state.boats) {
      if (!boat.alive) continue;
      const distance = Math.hypot(boat.x - crate.x, boat.z - crate.z);
      if (distance < nearestDistance) {
        nearest = boat;
        nearestDistance = distance;
      }
    }
    if (!nearest) continue;
    const pickupDistance = nearest.radius + 1.0;
    if (nearestDistance <= pickupDistance) {
      collectCrate(state, nearest, crate);
      continue;
    }
    const pull = Math.min(nearestDistance - pickupDistance,
      dt * (4 + (CRATE_MAGNET_RADIUS - nearestDistance) * 2.2));
    crate.x += (nearest.x - crate.x) / nearestDistance * pull;
    crate.z += (nearest.z - crate.z) / nearestDistance * pull;
    if (nearestDistance - pull <= pickupDistance) collectCrate(state, nearest, crate);
  }
}

function applyStormPressure(state, boat, dt) {
  if (!boat.alive || battleStage(state) !== "maelstrom") return;
  const safe = safeRadius(state);
  const radius = Math.hypot(boat.x, boat.z);
  if (radius <= safe - boat.radius) return;

  const overflow = Math.max(0, radius - (safe - boat.radius));
  const nx = radius > 0 ? -boat.x / radius : 0;
  const nz = radius > 0 ? -boat.z / radius : 0;
  boat.knockX += nx * dt * (3.2 + overflow * 0.22);
  boat.knockZ += nz * dt * (3.2 + overflow * 0.22);
  boat.energy = Math.max(0, boat.energy - dt * (5 + overflow * 0.25));

  if (state.time >= boat.invulnerableUntil) {
    boat.hp -= dt * (3.5 + overflow * 0.32);
    boat.lastHitAt = state.time;
    if (state.time - boat.lastStormAt > 2.5) {
      boat.lastStormAt = state.time;
      emit(state, "storm", boat.id, `${boat.name} 正在风暴区受损`, 2);
    }
    if (boat.hp <= 0) sinkBoat(state, boat, null);
  }
}

function stepBoat(state, boat, dt) {
  if (!boat.alive) {
    if (state.time >= boat.respawnAt && state.phase === "racing") respawnBoat(state, boat);
    return;
  }

  if (!boat.human || !boat.connected) aiInput(state, boat);

  boat.heading = normAngle(boat.heading + boat.steer * boat.turnRate * dt * (0.78 + boat.speed / 22));

  const usingBoost = boat.throttle && boat.energy > 0.5;
  const targetSpeed = usingBoost ? boat.boostSpeed : boat.baseSpeed;
  const response = usingBoost ? 3.8 : 2.6;
  boat.speed += (targetSpeed - boat.speed) * Math.min(1, dt * response);

  if (usingBoost) {
    boat.energy = Math.max(0, boat.energy - dt * 16);
  } else {
    boat.energy = Math.min(boat.maxEnergy, boat.energy + dt * boat.energyRegen);
  }

  boat.x += Math.sin(boat.heading) * boat.speed * dt + boat.knockX * dt;
  boat.z += Math.cos(boat.heading) * boat.speed * dt + boat.knockZ * dt;
  const knockDecay = Math.exp(-dt * 3.2);
  boat.knockX *= knockDecay;
  boat.knockZ *= knockDecay;

  const radius = Math.hypot(boat.x, boat.z);
  if (radius > WORLD_RADIUS - boat.radius) {
    const limit = WORLD_RADIUS - boat.radius;
    boat.x = boat.x / radius * limit;
    boat.z = boat.z / radius * limit;
    const inward = Math.atan2(-boat.x, -boat.z);
    boat.heading = normAngle(inward + boat.steer * 0.25);
    boat.speed *= 0.72;
  }

  applyStormPressure(state, boat, dt);
  if (!boat.alive) return;
  collectCrates(state, boat);
  fireBroadside(state, boat);
}

export function resolveBoatCollisions(state) {
  for (let i = 0; i < state.boats.length; i++) {
    const a = state.boats[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < state.boats.length; j++) {
      const b = state.boats[j];
      if (!b.alive) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let distance = Math.hypot(dx, dz);
      const minDistance = (a.radius + b.radius) * 0.92;
      if (distance >= minDistance) continue;
      if (distance < 0.001) {
        const angle = (a.id * 1.7 + b.id * 2.3) % (Math.PI * 2);
        dx = Math.cos(angle);
        dz = Math.sin(angle);
        distance = 1;
      }
      const nx = dx / distance, nz = dz / distance;
      const penetration = minDistance - distance;
      const correction = penetration * 0.52;
      a.x -= nx * correction;
      a.z -= nz * correction;
      b.x += nx * correction;
      b.z += nz * correction;

      const relativeForward =
        (Math.sin(a.heading) * a.speed - Math.sin(b.heading) * b.speed) * nx +
        (Math.cos(a.heading) * a.speed - Math.cos(b.heading) * b.speed) * nz;
      const shove = clamp(relativeForward * 0.42 + 1.5, 1.2, 5.5);
      a.knockX -= nx * shove;
      a.knockZ -= nz * shove;
      b.knockX += nx * shove;
      b.knockZ += nz * shove;
      a.speed *= 0.94;
      b.speed *= 0.94;

      if (
        state.time - a.lastCollisionAt > 0.9 &&
        state.time - b.lastCollisionAt > 0.9
      ) {
        a.lastCollisionAt = state.time;
        b.lastCollisionAt = state.time;
        emit(state, "collision", a.id, `${a.name} 与 ${b.name} 船体碰撞`, 1, {
          targetId: b.id,
        });
      }
    }
  }
}

export function ranking(state) {
  return [...state.boats].sort((a, b) =>
    b.score - a.score ||
    b.kills - a.kills ||
    b.level - a.level ||
    a.deaths - b.deaths ||
    a.id - b.id
  );
}

export function stepGame(state, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;

  state.time += dt;

  if (state.phase === "countdown") {
    state.countdown -= dt;
    if (state.countdown <= 0) {
      state.phase = "racing";
      state.countdown = 0;
      emit(state, "start", null, "开战！抢物资、升级、侧舷齐射！", 4);
    }
    return;
  }

  if (state.phase === "demo") {
    for (const boat of state.boats) {
      if (!boat.human) aiInput(state, boat);
      stepBoat(state, boat, dt);
    }
    stepProjectiles(state, dt);
    stepCrates(state, dt);
    return;
  }

  if (state.phase !== "racing") return;

  state.remaining = Math.max(0, state.remaining - dt);
  updateBattleStage(state);

  for (const boat of state.boats) stepBoat(state, boat, dt);
  resolveBoatCollisions(state);
  stepProjectiles(state, dt);
  stepMonster(state, dt);
  stepCrates(state, dt);

  if (state.remaining <= 0) {
    const order = ranking(state);
    state.phase = "result";
    state.winnerId = order[0]?.id ?? null;
    emit(state, "finish", state.winnerId,
      state.winnerId === null ? "本局结束" : `${order[0].name} 夺得海域第一！`,
      5,
    );
  }
}

export function snapshot(state) {
  return {
    v: 1,
    type: "state",
    protocol: state.protocol,
    phase: state.phase,
    round: state.round,
    time: state.time,
    remaining: state.remaining,
    seconds: state.seconds,
    countdown: state.countdown,
    stage: state.phase === "racing" ? battleStage(state) : state.stage,
    safeRadius: safeRadius(state),
    winnerId: state.winnerId,
    bountyId: currentBountyId(state),
    order: ranking(state).map((boat) => boat.id),
    events: state.events.slice(0, 8),
    crates: state.crates.map((crate) => ({
      id: crate.id,
      x: crate.x,
      z: crate.z,
      active: crate.active,
    })),
    projectiles: state.projectiles.map((projectile) => ({
      id: projectile.id,
      ownerId: projectile.ownerId,
      x: projectile.x,
      z: projectile.z,
      radius: projectile.radius,
    })),
    monster: state.monster ? {
      x: state.monster.x,
      z: state.monster.z,
      hp: state.monster.hp,
      maxHp: state.monster.maxHp,
      radius: state.monster.radius,
      alive: state.monster.alive,
      attack: state.monster.attack ? { ...state.monster.attack } : null,
    } : null,
    boats: state.boats.map((boat) => ({
      id: boat.id,
      name: boat.name,
      color: boat.color,
      human: boat.human,
      connected: boat.connected,
      ready: boat.ready,
      x: boat.x,
      z: boat.z,
      heading: boat.heading,
      speed: boat.speed,
      hp: boat.hp,
      maxHp: boat.maxHp,
      damage: boat.damage,
      fireInterval: boat.fireInterval,
      cannonCount: boat.cannonCount,
      radius: boat.radius,
      energy: boat.energy,
      maxEnergy: boat.maxEnergy,
      level: boat.level,
      xp: boat.xp,
      nextLevelXp: boat.nextLevelXp,
      choices: [...boat.choices],
      score: boat.score,
      kills: boat.kills,
      deaths: boat.deaths,
      alive: boat.alive,
      respawnAt: boat.respawnAt,
      invulnerableUntil: boat.invulnerableUntil,
      lastHitAt: boat.lastHitAt,
      lastFireAt: boat.lastFireAt,
      lastFireSide: boat.lastFireSide,
      lastCollisionAt: boat.lastCollisionAt,
      lastStormAt: boat.lastStormAt,
      killStreak: boat.killStreak,
      bestStreak: boat.bestStreak,
      bountyKills: boat.bountyKills,
    })),
  };
}

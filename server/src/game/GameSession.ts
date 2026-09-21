import RAPIER from "@dimforge/rapier3d-compat";
import type { Server } from "socket.io";
import type { GameEvent, MatchSnapshot, PlayerInput, PlayerSnapshot, PlayerState } from "@waiting/shared";

const PLAYER_COUNT = 8;
const ARENA_RADIUS = 6;
const PHYSICS_HZ = 60;
const TICK_MS = 1000 / PHYSICS_HZ;
const SNAPSHOT_INTERVAL_TICKS = 3; // 20Hz network snapshots; physics remains 60Hz.
const ROUND_MS = 60_000;
const COUNTDOWN_MS = 3_000;
const PUSH_COOLDOWN_MS = 850;
const SESSION_RECOVERY_MS = 90_000;

type Slot = {
  id: string;
  name: string;
  socketId?: string;
  sessionId?: string;
  disconnectedAt?: number;
  bot: boolean;
  body: RAPIER.RigidBody;
  facingYaw: number;
  state: PlayerState;
  alive: boolean;
  pushReadyAt: number;
  knockedUntil: number;
  recoverUntil: number;
  edgeHangUntil: number;
  edgeHanging: boolean;
  score: number;
  lastHitBy?: string;
  lastHitAt: number;
  botTargetId?: string;
  botRetargetAt: number;
  botOrbit: number;
  botAggression: number;
  input: PlayerInput;
};

export class GameSession {
  private world!: RAPIER.World;
  private slots: Slot[] = [];
  private startedAt = Date.now();
  private countdownUntil = 0;
  private phase: MatchSnapshot["phase"] = "countdown";
  private winnerId: string | undefined;
  private restartAt = 0;
  private eventSeq = 0;
  private pendingEvents: GameEvent[] = [];
  private timer: NodeJS.Timeout | undefined;
  private tickCounter = 0;

  constructor(private readonly io: Server) {}

  async start() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.createArena();
    this.createSlots();
    this.resetRound();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  join(socketId: string, rawSessionId?: string, requestedName?: string) {
    const sessionId = sanitizeSessionId(rawSessionId);
    const now = Date.now();
    this.releaseExpiredSessions(now);

    if (sessionId) {
      const recovered = this.slots.find((candidate) => candidate.sessionId === sessionId);
      if (recovered) {
        recovered.socketId = socketId;
        recovered.bot = false;
        recovered.disconnectedAt = undefined;
        recovered.name = sanitizeName(requestedName) || recovered.name;
        recovered.input = this.emptyInput();

        return {
          playerId: recovered.id,
          name: recovered.name,
          sessionId,
          recovered: true,
        };
      }
    }

    let slot = this.slots.find((candidate) => candidate.bot && !candidate.sessionId && candidate.alive);
    if (!slot) slot = this.slots.find((candidate) => candidate.bot && !candidate.sessionId);
    if (!slot) return null;

    const assignedSessionId = sessionId || `guest-${socketId}`;
    slot.socketId = socketId;
    slot.sessionId = assignedSessionId;
    slot.disconnectedAt = undefined;
    slot.bot = false;
    slot.name = sanitizeName(requestedName) || `Player ${Number(slot.id.split("-")[1]) + 1}`;
    slot.input = this.emptyInput();

    return {
      playerId: slot.id,
      name: slot.name,
      sessionId: assignedSessionId,
      recovered: false,
    };
  }

  leave(socketId: string) {
    const slot = this.slots.find((candidate) => candidate.socketId === socketId);
    if (!slot) return;

    slot.socketId = undefined;
    slot.disconnectedAt = Date.now();
    slot.bot = true;
    // AI takes over the same physical character immediately. The stable session
    // stays reserved briefly so a refreshed/awakened phone can reclaim it.
    slot.input = this.emptyInput();
  }

  private releaseExpiredSessions(now: number) {
    for (const slot of this.slots) {
      if (!slot.bot || !slot.sessionId || slot.disconnectedAt === undefined) continue;
      if (now - slot.disconnectedAt < SESSION_RECOVERY_MS) continue;

      slot.sessionId = undefined;
      slot.disconnectedAt = undefined;
      slot.name = `BOT ${Number(slot.id.split("-")[1]) + 1}`;
    }
  }

  input(socketId: string, raw: Partial<PlayerInput>) {
    const slot = this.slots.find((candidate) => candidate.socketId === socketId);
    if (!slot || !slot.alive) return;

    slot.input = {
      seq: Number.isFinite(raw.seq) ? Number(raw.seq) : slot.input.seq + 1,
      moveX: clamp(Number(raw.moveX) || 0, -1, 1),
      moveY: clamp(Number(raw.moveY) || 0, -1, 1),
      // Latch push until the authoritative tick consumes it so a very short tap is never lost.
      push: Boolean(raw.push) || slot.input.push,
    };
  }

  private createArena() {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0),
    );

    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.25, ARENA_RADIUS)
        .setFriction(1.25)
        .setRestitution(0.04),
      body,
    );
  }

  private createSlots() {
    this.slots = Array.from({ length: PLAYER_COUNT }, (_, index) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, 1, 0)
          .setLinearDamping(2.5)
          .setAngularDamping(2.2)
          .setCanSleep(false),
      );

      this.world.createCollider(
        RAPIER.ColliderDesc.capsule(0.48, 0.36)
          .setDensity(1.2)
          .setFriction(1.1)
          .setRestitution(0.08),
        body,
      );

      return {
        id: `P-${index}`,
        name: `BOT ${index + 1}`,
        bot: true,
        body,
        facingYaw: angleFromIndex(index),
        state: "idle",
        alive: true,
        pushReadyAt: 0,
        knockedUntil: 0,
        recoverUntil: 0,
        edgeHangUntil: 0,
        edgeHanging: false,
        score: 0,
        lastHitAt: 0,
        botRetargetAt: 0,
        botOrbit: index % 2 === 0 ? 1 : -1,
        botAggression: 0.78 + ((index * 17) % 20) / 100,
        input: this.emptyInput(),
      };
    });
  }

  private emptyInput(): PlayerInput {
    return { seq: 0, moveX: 0, moveY: 0, push: false };
  }

  private resetRound() {
    const now = Date.now();
    this.countdownUntil = now + COUNTDOWN_MS;
    this.startedAt = this.countdownUntil;
    this.phase = "countdown";
    this.winnerId = undefined;
    this.restartAt = 0;
    this.pendingEvents = [];

    this.slots.forEach((slot, index) => {
      const angle = (index / PLAYER_COUNT) * Math.PI * 2;
      const radius = 3.15;
      slot.body.setEnabled(true);
      slot.body.setGravityScale(1, true);
      slot.body.setTranslation(
        { x: Math.cos(angle) * radius, y: 1.05, z: Math.sin(angle) * radius },
        true,
      );
      slot.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      slot.facingYaw = Math.atan2(-Math.cos(angle), -Math.sin(angle));
      slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      slot.state = "idle";
      slot.alive = true;
      slot.edgeHanging = false;
      slot.edgeHangUntil = 0;
      slot.knockedUntil = 0;
      slot.recoverUntil = 0;
      slot.pushReadyAt = this.countdownUntil + 800;
      slot.score = 0;
      slot.lastHitBy = undefined;
      slot.lastHitAt = 0;
      slot.botTargetId = undefined;
      slot.botRetargetAt = 0;
      slot.input = this.emptyInput();
    });
  }

  private tick() {
    const now = Date.now();
    this.tickCounter += 1;
    this.releaseExpiredSessions(now);

    if (this.phase === "finished") {
      if (this.shouldBroadcast()) this.broadcast(now);
      if (now >= this.restartAt) this.resetRound();
      return;
    }

    if (this.phase === "countdown") {
      if (now < this.countdownUntil) {
        if (this.shouldBroadcast()) this.broadcast(now);
        return;
      }
      this.phase = "playing";
      this.startedAt = now;
    }

    for (const slot of this.slots) {
      if (!slot.alive) continue;

      this.advanceRecovery(slot, now);

      const direction = slot.bot ? this.botDirection(slot, now) : this.inputDirection(slot);
      this.drive(slot, direction, now);

      const wantsPush = slot.bot
        ? this.shouldBotPush(slot, now)
        : slot.input.push;

      if (wantsPush) this.push(slot, direction, now);
      if (!slot.bot) slot.input.push = false;

      this.applyUprightAssist(slot, now);
    }

    this.world.timestep = 1 / PHYSICS_HZ;
    this.world.step();

    for (const slot of this.slots) this.updateState(slot, now);

    const alive = this.slots.filter((slot) => slot.alive);
    if (now - this.startedAt >= ROUND_MS || alive.length <= 1) {
      this.phase = "finished";
      const rankedAlive = [...alive].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ap = a.body.translation();
        const bp = b.body.translation();
        return Math.hypot(ap.x, ap.z) - Math.hypot(bp.x, bp.z);
      });
      this.winnerId = rankedAlive[0]?.id;
      this.restartAt = now + 8_000;
      if (this.winnerId) {
        this.emitEvent("win", now, this.winnerId, undefined, 1);
      }
    }

    if (this.shouldBroadcast() || this.pendingEvents.length > 0) this.broadcast(now);
  }

  private shouldBroadcast() {
    return this.tickCounter % SNAPSHOT_INTERVAL_TICKS === 0;
  }

  private advanceRecovery(slot: Slot, now: number) {
    if (slot.edgeHanging) return;

    if (slot.state === "hit" && now >= slot.knockedUntil) {
      slot.state = "recovering";
      slot.recoverUntil = now + 520;
    }

    if (slot.state === "recovering" && now >= slot.recoverUntil) {
      slot.state = "idle";
    }
  }

  private applyUprightAssist(slot: Slot, now: number) {
    if (!slot.alive || slot.edgeHanging || now < slot.knockedUntil) return;

    const q = slot.body.rotation();
    const upX = 2 * (q.x * q.y - q.z * q.w);
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const upZ = 2 * (q.y * q.z + q.x * q.w);
    const tilt = Math.acos(clamp(upY, -1, 1));

    if (tilt < 0.025) return;

    const recoveryBoost = slot.state === "recovering" ? 1.9 : 1;
    const strength = Math.min(0.11, tilt * 0.045) * recoveryBoost;

    slot.body.applyTorqueImpulse(
      { x: -upZ * strength, y: 0, z: upX * strength },
      true,
    );
  }

  private inputDirection(slot: Slot) {
    return normalize(slot.input.moveX, slot.input.moveY);
  }

  private botDirection(slot: Slot, now: number) {
    const p = slot.body.translation();
    const radius = Math.hypot(p.x, p.z);
    const edgeDistance = ARENA_RADIUS - radius;

    if (edgeDistance < 1.35) {
      const inward = normalize(-p.x, -p.z);
      const tangent = { x: -inward.z * slot.botOrbit, z: inward.x * slot.botOrbit };
      const panic = clamp((1.35 - edgeDistance) / 0.85, 0, 1);
      return normalize(
        inward.x * (1 + panic * 1.6) + tangent.x * 0.2,
        inward.z * (1 + panic * 1.6) + tangent.z * 0.2,
      );
    }

    let target = this.slots.find(
      (candidate) =>
        candidate.id === slot.botTargetId &&
        candidate !== slot &&
        candidate.alive,
    );

    if (!target || now >= slot.botRetargetAt) {
      let best = Number.POSITIVE_INFINITY;
      target = undefined;

      for (const candidate of this.slots) {
        if (candidate === slot || !candidate.alive) continue;
        const c = candidate.body.translation();
        const distance = Math.hypot(c.x - p.x, c.z - p.z);
        const existingFocus = this.slots.filter(
          (other) => other !== slot && other.botTargetId === candidate.id,
        ).length;
        const score = distance + existingFocus * 1.15;

        if (score < best) {
          best = score;
          target = candidate;
        }
      }

      slot.botTargetId = target?.id;
      slot.botRetargetAt = now + 650 + (Number(slot.id.split("-")[1]) % 4) * 130;
    }

    if (!target) return { x: 0, z: 0 };

    const t = target.body.translation();
    const direct = normalize(t.x - p.x, t.z - p.z);
    const distance = Math.hypot(t.x - p.x, t.z - p.z);
    const orbitAmount = distance > 1.7 ? 0.28 * (1 - slot.botAggression) : 0.05;
    const tangent = { x: -direct.z * slot.botOrbit, z: direct.x * slot.botOrbit };

    return normalize(
      direct.x + tangent.x * orbitAmount,
      direct.z + tangent.z * orbitAmount,
    );
  }

  private drive(slot: Slot, direction: { x: number; z: number }, now: number) {
    if (slot.edgeHanging || now < slot.knockedUntil) return;

    const magnitude = Math.hypot(direction.x, direction.z);
    if (magnitude < 0.05) {
      if (slot.state !== "recovering") slot.state = "idle";
      return;
    }

    const controlScale = slot.state === "recovering" ? 0.35 : 1;
    if (slot.state !== "recovering") slot.state = "moving";
    slot.facingYaw = Math.atan2(direction.x, direction.z);
    slot.body.applyImpulse(
      {
        x: direction.x * 0.16 * controlScale,
        y: 0,
        z: direction.z * 0.16 * controlScale,
      },
      true,
    );

    const velocity = slot.body.linvel();
    const horizontal = Math.hypot(velocity.x, velocity.z);
    if (horizontal > 4.2) {
      const scale = 4.2 / horizontal;
      slot.body.setLinvel(
        { x: velocity.x * scale, y: velocity.y, z: velocity.z * scale },
        true,
      );
    }
  }

  private shouldBotPush(slot: Slot, now: number) {
    if (now < slot.pushReadyAt) return false;
    const p = slot.body.translation();

    return this.slots.some((target) => {
      if (target === slot || !target.alive) return false;
      const t = target.body.translation();
      return Math.hypot(t.x - p.x, t.z - p.z) < 1.25 + slot.botAggression * 0.28;
    });
  }

  private push(slot: Slot, direction: { x: number; z: number }, now: number) {
    if (!slot.alive || slot.edgeHanging || now < slot.pushReadyAt) return;

    let dx = direction.x;
    let dz = direction.z;
    if (Math.hypot(dx, dz) < 0.05) {
      const velocity = slot.body.linvel();
      const fallback = normalize(velocity.x, velocity.z);
      dx = fallback.x || 0;
      dz = fallback.z || 1;
    }

    const dir = normalize(dx, dz);
    slot.facingYaw = Math.atan2(dir.x, dir.z);
    slot.pushReadyAt = now + PUSH_COOLDOWN_MS;
    slot.state = "pushing";
    slot.body.applyImpulse({ x: dir.x * 1.7, y: 0.1, z: dir.z * 1.7 }, true);

    const origin = slot.body.translation();

    for (const target of this.slots) {
      if (target === slot || !target.alive) continue;
      const p = target.body.translation();
      const rx = p.x - origin.x;
      const rz = p.z - origin.z;
      const distance = Math.hypot(rx, rz);
      if (distance > 1.65 || distance < 0.001) continue;

      const radial = normalize(rx, rz);
      const facing = dir.x * radial.x + dir.z * radial.z;
      if (facing < 0.15) continue;

      const strength = Math.max(0.8, 3.0 * (1 - distance / 2.25));
      target.body.applyImpulseAtPoint(
        { x: radial.x * strength, y: 0.65, z: radial.z * strength },
        { x: p.x, y: p.y + 0.55, z: p.z },
        true,
      );
      target.state = "hit";
      target.knockedUntil = now + 650;
      target.lastHitBy = slot.id;
      target.lastHitAt = now;
      this.emitEvent("push_hit", now, slot.id, target.id, Math.min(1, strength / 3));
    }
  }

  private updateState(slot: Slot, now: number) {
    if (!slot.alive) return;

    const p = slot.body.translation();
    const radius = Math.hypot(p.x, p.z);

    if (
      !slot.edgeHanging &&
      p.y < -0.12 &&
      radius > ARENA_RADIUS - 0.5 &&
      radius < ARENA_RADIUS + 1.2
    ) {
      slot.edgeHanging = true;
      slot.edgeHangUntil = now + 1_400;
      slot.state = "edge_hang";
      slot.body.setGravityScale(0, true);
      slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

      const outward = normalize(p.x, p.z);
      slot.body.setTranslation(
        { x: outward.x * (ARENA_RADIUS + 0.12), y: -0.35, z: outward.z * (ARENA_RADIUS + 0.12) },
        true,
      );
    }

    if (slot.edgeHanging) {
      const hp = slot.body.translation();
      const inward = normalize(-hp.x, -hp.z);
      const controllerDirection = normalize(slot.input.moveX, slot.input.moveY);
      const controllerPointsInward =
        controllerDirection.x * inward.x + controllerDirection.z * inward.z > 0.3;

      const inwardIntent = slot.bot
        ? now > slot.edgeHangUntil - 650
        : controllerPointsInward;

      if (inwardIntent) {
        slot.body.setGravityScale(1, true);
        slot.body.setTranslation(
          { x: hp.x + inward.x * 1.25, y: 0.95, z: hp.z + inward.z * 1.25 },
          true,
        );
        slot.body.setLinvel({ x: inward.x * 1.4, y: 1.45, z: inward.z * 1.4 }, true);
        slot.edgeHanging = false;
        slot.state = "recovering";
        this.emitEvent("edge_save", now, slot.id, undefined, 0.8);
        return;
      }

      if (now >= slot.edgeHangUntil) {
        slot.body.setGravityScale(1, true);
        slot.edgeHanging = false;
      }
    }

    if (p.y < -2.6) {
      slot.alive = false;
      slot.state = "eliminated";
      slot.body.setEnabled(false);
      if (slot.lastHitBy && now - slot.lastHitAt <= 4_000) {
        const scorer = this.slots.find((candidate) => candidate.id === slot.lastHitBy);
        if (scorer) scorer.score += 1;
      }
      const living = this.slots.filter((candidate) => candidate.alive).length;
      this.emitEvent(
        living <= 1 ? "final_elimination" : "big_fall",
        now,
        undefined,
        slot.id,
        living <= 1 ? 1 : 0.75,
      );
      return;
    }

  }

  private emitEvent(
    type: GameEvent["type"],
    atMs: number,
    actorId?: string,
    targetId?: string,
    importance = 0.5,
  ) {
    const event: GameEvent = {
      id: `E-${++this.eventSeq}`,
      type,
      atMs,
      actorId,
      targetId,
      importance,
    };

    this.pendingEvents.push(event);
    // Small latency-critical reactions (camera/audio/haptics) should not wait
    // for the next 20Hz state snapshot.
    this.io.emit("game:event", event);
  }

  private broadcast(now: number) {
    const timeLeftMs = this.phase === "countdown"
      ? ROUND_MS
      : Math.max(0, ROUND_MS - (now - this.startedAt));

    const snapshot: MatchSnapshot = {
      matchId: `main-${this.startedAt}`,
      serverTimeMs: now,
      timeLeftMs,
      phase: this.phase,
      countdownLeftMs: this.phase === "countdown"
        ? Math.max(0, this.countdownUntil - now)
        : undefined,
      winnerId: this.winnerId,
      events: this.pendingEvents.splice(0),
      players: this.slots.map((slot): PlayerSnapshot => {
        const p = slot.body.translation();
        const q = slot.body.rotation();
        const v = slot.body.linvel();
        return {
          id: slot.id,
          name: slot.name,
          position: [p.x, p.y, p.z],
          rotation: [q.x, q.y, q.z, q.w],
          facingYaw: slot.facingYaw,
          velocity: [v.x, v.y, v.z],
          score: slot.score,
          state: slot.state,
          eliminated: !slot.alive,
          bot: slot.bot,
        };
      }),
    };

    this.io.emit("match:snapshot", snapshot);
  }
}

function angleFromIndex(index: number) {
  const angle = (index / PLAYER_COUNT) * Math.PI * 2;
  return Math.atan2(-Math.cos(angle), -Math.sin(angle));
}

function sanitizeSessionId(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{8,80}$/.test(trimmed) ? trimmed : "";
}

function sanitizeName(value?: string) {
  if (!value) return "";
  return value.trim().replace(/[<>]/g, "").slice(0, 16);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x: number, z: number) {
  const length = Math.hypot(x, z);
  if (length < 0.0001) return { x: 0, z: 0 };
  return { x: x / length, z: z / length };
}

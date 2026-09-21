import RAPIER from "@dimforge/rapier3d-compat";
import type { Server } from "socket.io";
import type { GameEvent, MatchSnapshot, PlayerInput, PlayerSnapshot, PlayerState } from "@waiting/shared";

const PLAYER_COUNT = 8;
const ARENA_RADIUS = 6;
const TICK_MS = 50;
const ROUND_MS = 60_000;
const PUSH_COOLDOWN_MS = 850;

type Slot = {
  id: string;
  name: string;
  socketId?: string;
  bot: boolean;
  body: RAPIER.RigidBody;
  state: PlayerState;
  alive: boolean;
  pushReadyAt: number;
  knockedUntil: number;
  edgeHangUntil: number;
  edgeHanging: boolean;
  input: PlayerInput;
};

export class GameRoom {
  private world!: RAPIER.World;
  private slots: Slot[] = [];
  private startedAt = Date.now();
  private phase: MatchSnapshot["phase"] = "playing";
  private winnerId: string | undefined;
  private restartAt = 0;
  private eventSeq = 0;
  private pendingEvents: GameEvent[] = [];
  private timer: NodeJS.Timeout | undefined;

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

  join(socketId: string, requestedName?: string) {
    let slot = this.slots.find((candidate) => candidate.bot && candidate.alive);
    if (!slot) slot = this.slots.find((candidate) => candidate.bot);
    if (!slot) return null;

    slot.socketId = socketId;
    slot.bot = false;
    slot.name = (requestedName || `Player ${slot.id}`).slice(0, 16);
    slot.input = this.emptyInput();

    return { playerId: slot.id, name: slot.name };
  }

  leave(socketId: string) {
    const slot = this.slots.find((candidate) => candidate.socketId === socketId);
    if (!slot) return;

    slot.socketId = undefined;
    slot.bot = true;
    slot.name = `BOT ${Number(slot.id.split("-")[1]) + 1}`;
    slot.input = this.emptyInput();
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
          .setLinearDamping(2.8)
          .setAngularDamping(4.2)
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
        state: "idle",
        alive: true,
        pushReadyAt: 0,
        knockedUntil: 0,
        edgeHangUntil: 0,
        edgeHanging: false,
        input: this.emptyInput(),
      };
    });
  }

  private emptyInput(): PlayerInput {
    return { seq: 0, moveX: 0, moveY: 0, push: false };
  }

  private resetRound() {
    const now = Date.now();
    this.startedAt = now;
    this.phase = "playing";
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
      slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      slot.state = "idle";
      slot.alive = true;
      slot.edgeHanging = false;
      slot.edgeHangUntil = 0;
      slot.knockedUntil = 0;
      slot.pushReadyAt = now + 800;
      slot.input = this.emptyInput();
    });
  }

  private tick() {
    const now = Date.now();

    if (this.phase === "finished") {
      this.broadcast(now);
      if (now >= this.restartAt) this.resetRound();
      return;
    }

    for (const slot of this.slots) {
      if (!slot.alive) continue;

      const direction = slot.bot ? this.botDirection(slot) : this.inputDirection(slot);
      this.drive(slot, direction, now);

      const wantsPush = slot.bot
        ? this.shouldBotPush(slot, now)
        : slot.input.push;

      if (wantsPush) this.push(slot, direction, now);
      if (!slot.bot) slot.input.push = false;
    }

    this.world.timestep = TICK_MS / 1000;
    this.world.step();

    for (const slot of this.slots) this.updateState(slot, now);

    const alive = this.slots.filter((slot) => slot.alive);
    if (now - this.startedAt >= ROUND_MS || alive.length <= 1) {
      this.phase = "finished";
      this.winnerId = alive[0]?.id;
      this.restartAt = now + 8_000;
      if (this.winnerId) {
        this.emitEvent("win", now, this.winnerId, undefined, 1);
      }
    }

    this.broadcast(now);
  }

  private inputDirection(slot: Slot) {
    return normalize(slot.input.moveX, slot.input.moveY);
  }

  private botDirection(slot: Slot) {
    const p = slot.body.translation();
    const radius = Math.hypot(p.x, p.z);

    if (ARENA_RADIUS - radius < 1.25) {
      return normalize(-p.x, -p.z);
    }

    let target: Slot | undefined;
    let best = Number.POSITIVE_INFINITY;

    for (const candidate of this.slots) {
      if (candidate === slot || !candidate.alive) continue;
      const c = candidate.body.translation();
      const distance = Math.hypot(c.x - p.x, c.z - p.z);
      if (distance < best) {
        best = distance;
        target = candidate;
      }
    }

    if (!target) return { x: 0, z: 0 };
    const t = target.body.translation();
    return normalize(t.x - p.x, t.z - p.z);
  }

  private drive(slot: Slot, direction: { x: number; z: number }, now: number) {
    if (slot.edgeHanging || now < slot.knockedUntil) return;

    const magnitude = Math.hypot(direction.x, direction.z);
    if (magnitude < 0.05) {
      slot.state = "idle";
      return;
    }

    slot.state = "moving";
    slot.body.applyImpulse(
      { x: direction.x * 0.16, y: 0, z: direction.z * 0.16 },
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
      return Math.hypot(t.x - p.x, t.z - p.z) < 1.45;
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

    if (now >= slot.knockedUntil && slot.state === "hit") {
      slot.state = "recovering";
      const q = slot.body.rotation();
      slot.body.setRotation({ x: 0, y: q.y, z: 0, w: Math.sqrt(Math.max(0, 1 - q.y * q.y)) }, true);
      slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  private emitEvent(
    type: GameEvent["type"],
    atMs: number,
    actorId?: string,
    targetId?: string,
    importance = 0.5,
  ) {
    this.pendingEvents.push({
      id: `E-${++this.eventSeq}`,
      type,
      atMs,
      actorId,
      targetId,
      importance,
    });
  }

  private broadcast(now: number) {
    const timeLeftMs = Math.max(0, ROUND_MS - (now - this.startedAt));

    const snapshot: MatchSnapshot = {
      matchId: `main-${this.startedAt}`,
      serverTimeMs: now,
      timeLeftMs,
      phase: this.phase,
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
          velocity: [v.x, v.y, v.z],
          state: slot.state,
          eliminated: !slot.alive,
          bot: slot.bot,
        };
      }),
    };

    this.io.to("main").emit("match:snapshot", snapshot);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x: number, z: number) {
  const length = Math.hypot(x, z);
  if (length < 0.0001) return { x: 0, z: 0 };
  return { x: x / length, z: z / length };
}

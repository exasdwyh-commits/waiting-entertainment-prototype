import RAPIER from "@dimforge/rapier3d-compat";
import type { Server } from "socket.io";
import { TABLE_PUSH_GEOMETRY } from "@waiting/shared";
import type { GameEvent, MatchSnapshot, PlayerInput, PlayerSnapshot, PlayerState } from "@waiting/shared";
import { GAME_TUNING, validateGameTuning } from "./tuning.js";

const PLAYER_COUNT = 10;
const PHYSICS_HZ = 60;
const TICK_MS = 1000 / PHYSICS_HZ;
const SNAPSHOT_INTERVAL_TICKS = 3; // 20Hz network snapshots; physics remains 60Hz.
const ROUND_MS = positiveEnvMs("WAITING_ROUND_MS") ?? GAME_TUNING.match.roundMs;
const COUNTDOWN_MS = 3_000;
const RESULT_MS = GAME_TUNING.match.resultMs;
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
  balance: number;
  stamina: number;
  staminaRecoverAt: number;
  koResistance: number;
  koUntil: number;
  wakeUntil: number;
  struggleProgress: number;
  lastStruggleAt: number;
  jumpReadyAt: number;
  airborneUntil: number;
  dropkickArmedUntil: number;
  kickReadyAt: number;
  sprinting: boolean;
  state: PlayerState;
  alive: boolean;
  respawnAt: number;
  invulnerableUntil: number;
  pushReadyAt: number;
  pushStateUntil: number;
  tossTargetId?: string;
  carriedBy?: string;
  tossStartedAt: number;
  tossReleaseAt: number;
  tossDirection?: { x: number; z: number };
  tossMomentum: number;
  grabNeedsRelease: boolean;
  knockedUntil: number;
  recoverUntil: number;
  edgeHangUntil: number;
  edgeHanging: boolean;
  climbStartedAt: number;
  climbUntil: number;
  climbFrom?: { x: number; y: number; z: number };
  climbTo?: { x: number; y: number; z: number };
  score: number;
  lastHitBy?: string;
  lastHitAt: number;
  botTargetId?: string;
  botRetargetAt: number;
  botOrbit: number;
  botAggression: number;
  botEdgeCaution: number;
  botOrbitStrength: number;
  botEdgeHunter: number;
  botPushRange: number;
  botPushFacing: number;
  botCooldownScale: number;
  botMoveScale: number;
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
  private centerSpinRadians = 0;

  constructor(private readonly io: Server) {}

  async start() {
    validateGameTuning();
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: GAME_TUNING.world.gravityY, z: 0 });
    this.createArena();
    this.createSlots();
    this.resetRound();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  startHostedRound() {
    this.resetRound();
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
        recovered.grabNeedsRelease = false;

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

  debugForceFall(socketId: string) {
    const slot = this.slots.find(
      (candidate) => candidate.socketId === socketId && candidate.alive,
    );
    if (!slot) return false;

    if (slot.tossTargetId) {
      const carried = this.slots.find(
        (candidate) =>
          candidate.id === slot.tossTargetId &&
          candidate.carriedBy === slot.id,
      );
      if (carried) this.dropTossTarget(slot, carried, Date.now());
      else this.clearToss(slot);
    }

    const p = slot.body.translation();
    slot.edgeHanging = false;
    slot.state = "ragdoll";
    slot.body.setGravityScale(1, true);
    slot.body.setTranslation({ x: p.x, y: -3.1, z: p.z }, true);
    slot.body.setLinvel({ x: 0, y: -1, z: 0 }, true);
    return true;
  }

  leave(socketId: string) {
    const slot = this.slots.find((candidate) => candidate.socketId === socketId);
    if (!slot) return;

    slot.socketId = undefined;
    slot.disconnectedAt = Date.now();
    slot.bot = true;
    slot.grabNeedsRelease = false;
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
      // Attack is latched until the authoritative tick consumes it so a short tap is never lost.
      push: Boolean(raw.push) || slot.input.push,
      attack:
        Boolean(raw.attack) ||
        Boolean(raw.push) ||
        slot.input.attack,
      grab: Boolean(raw.grab),
      sprint: Boolean(raw.sprint),
      jump: Boolean(raw.jump) || slot.input.jump,
      kick: Boolean(raw.kick) || slot.input.kick,
    };
    if (!slot.input.grab) slot.grabNeedsRelease = false;
  }

  private createArena() {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0),
    );

    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.25, TABLE_PUSH_GEOMETRY.arenaRadius)
        .setFriction(GAME_TUNING.world.arenaFriction)
        .setRestitution(GAME_TUNING.world.arenaRestitution),
      body,
    );
  }

  private createSlots() {
    this.slots = Array.from({ length: PLAYER_COUNT }, (_, index) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, 1, 0)
          .setLinearDamping(GAME_TUNING.movement.linearDamping)
          .setAngularDamping(GAME_TUNING.movement.angularDamping)
          .setCanSleep(false),
      );

      this.world.createCollider(
        RAPIER.ColliderDesc.capsule(0.48, 0.36)
          .setDensity(1.2)
          .setFriction(GAME_TUNING.movement.colliderFriction)
          .setRestitution(GAME_TUNING.movement.colliderRestitution),
        body,
      );

      const profile = botProfile(index);

      return {
        id: `P-${index}`,
        name: `BOT ${index + 1}`,
        bot: true,
        body,
        facingYaw: angleFromIndex(index),
        balance: 1,
        stamina: GAME_TUNING.stamina.max,
        staminaRecoverAt: 0,
        koResistance: GAME_TUNING.ko.maxResistance,
        koUntil: 0,
        wakeUntil: 0,
        struggleProgress: 0,
        lastStruggleAt: 0,
        jumpReadyAt: 0,
        airborneUntil: 0,
        dropkickArmedUntil: 0,
        kickReadyAt: 0,
        sprinting: false,
        state: "idle",
        alive: true,
        respawnAt: 0,
        invulnerableUntil: 0,
        pushReadyAt: 0,
        pushStateUntil: 0,
        tossStartedAt: 0,
        tossReleaseAt: 0,
        tossMomentum: 0,
        grabNeedsRelease: false,
        knockedUntil: 0,
        recoverUntil: 0,
        edgeHangUntil: 0,
        edgeHanging: false,
        climbStartedAt: 0,
        climbUntil: 0,
        score: 0,
        lastHitAt: 0,
        botRetargetAt: 0,
        botOrbit: index % 2 === 0 ? 1 : -1,
        botAggression: profile.aggression,
        botEdgeCaution: profile.edgeCaution,
        botOrbitStrength: profile.orbitStrength,
        botEdgeHunter: profile.edgeHunter,
        botPushRange: profile.pushRange,
        botPushFacing: profile.pushFacing,
        botCooldownScale: profile.cooldownScale,
        botMoveScale: profile.moveScale,
        input: this.emptyInput(),
      };
    });
  }

  private emptyInput(): PlayerInput {
    return {
      seq: 0,
      moveX: 0,
      moveY: 0,
      push: false,
      attack: false,
      grab: false,
      sprint: false,
      jump: false,
      kick: false,
    };
  }

  private resetRound() {
    const now = Date.now();
    this.countdownUntil = now + COUNTDOWN_MS;
    this.startedAt = this.countdownUntil;
    this.phase = "countdown";
    this.winnerId = undefined;
    this.restartAt = 0;
    this.pendingEvents = [];
    this.centerSpinRadians = 0;

    this.slots.forEach((slot, index) => {
      const angle = (index / PLAYER_COUNT) * Math.PI * 2;
      const radius = TABLE_PUSH_GEOMETRY.spawnRadius;
      slot.body.setEnabled(true);
      slot.body.setGravityScale(1, true);
      slot.body.setTranslation(
        { x: Math.cos(angle) * radius, y: 1.05, z: Math.sin(angle) * radius },
        true,
      );
      slot.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      slot.facingYaw = Math.atan2(-Math.cos(angle), -Math.sin(angle));
      slot.balance = 1;
      slot.stamina = GAME_TUNING.stamina.max;
      slot.staminaRecoverAt = 0;
      slot.koResistance = GAME_TUNING.ko.maxResistance;
      slot.koUntil = 0;
      slot.wakeUntil = 0;
      slot.struggleProgress = 0;
      slot.lastStruggleAt = 0;
      slot.jumpReadyAt = 0;
      slot.airborneUntil = 0;
      slot.dropkickArmedUntil = 0;
      slot.kickReadyAt = 0;
      slot.sprinting = false;
      slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      slot.state = "idle";
      slot.alive = true;
      slot.respawnAt = 0;
      slot.invulnerableUntil = 0;
      slot.edgeHanging = false;
      slot.edgeHangUntil = 0;
      slot.climbStartedAt = 0;
      slot.climbUntil = 0;
      slot.climbFrom = undefined;
      slot.climbTo = undefined;
      slot.knockedUntil = 0;
      slot.recoverUntil = 0;
      slot.pushReadyAt = this.countdownUntil + GAME_TUNING.push.cooldownMs;
      slot.pushStateUntil = 0;
      slot.tossTargetId = undefined;
      slot.carriedBy = undefined;
      slot.tossStartedAt = 0;
      slot.tossReleaseAt = 0;
      slot.tossDirection = undefined;
      slot.tossMomentum = 0;
      slot.grabNeedsRelease = false;
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

    this.processRespawns(now);

    for (const slot of this.slots) {
      if (!slot.alive) continue;

      this.updateStamina(slot, now);
      this.recoverKoResistance(slot, now);

      if (slot.carriedBy) {
        this.processCarriedStruggle(slot, now);
        if (!slot.bot) {
          slot.input.attack = false;
          slot.input.push = false;
          slot.input.jump = false;
          slot.input.kick = false;
        }
        continue;
      }

      if (this.advanceKoState(slot, now)) continue;
      this.advanceRecovery(slot, now);
      if (this.advanceClimb(slot, now)) continue;

      const direction = slot.bot
        ? this.botDirection(slot, now)
        : this.inputDirection(slot);

      this.maintainGrab(slot, now);

      const wantsGrab = slot.bot
        ? this.shouldBotGrab(slot, now)
        : slot.input.grab;
      if (wantsGrab && !slot.tossTargetId) {
        this.tryGrab(slot, direction, now);
      }

      const wantsJump = !slot.bot && slot.input.jump;
      if (wantsJump) this.jump(slot, direction, now);

      this.drive(slot, direction, now);

      const wantsKick = !slot.bot && slot.input.kick;
      if (wantsKick) this.kickAction(slot, direction, now);

      const wantsAttack = slot.bot
        ? this.shouldBotPush(slot, now)
        : slot.input.attack || slot.input.push;

      if (wantsAttack) {
        if (slot.tossTargetId) this.throwCarried(slot, direction, now);
        else this.attack(slot, direction, now);
      }

      if (!slot.bot) {
        slot.input.attack = false;
        slot.input.push = false;
        slot.input.jump = false;
        slot.input.kick = false;
      }

      this.stabilizeStanding(slot, now);
      this.applyUprightAssist(slot, now);
    }

    this.updateLazySusan(now);

    this.world.timestep = 1 / PHYSICS_HZ;
    this.world.step();

    for (const slot of this.slots) this.updateState(slot, now);

    const alive = this.slots.filter((slot) => slot.alive);
    const timedOut = now - this.startedAt >= ROUND_MS;
    const pendingRespawns = this.slots.some((slot) => slot.respawnAt > 0);
    const finalLastStanding =
      this.matchStage(now) === "final" &&
      alive.length <= 1 &&
      !pendingRespawns;

    if (timedOut || finalLastStanding) {
      this.releaseActiveTosses(now);
      this.phase = "finished";

      const candidates =
        timedOut || alive.length === 0 ? [...this.slots] : [...alive];
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.alive !== b.alive) return Number(b.alive) - Number(a.alive);
        const ap = a.body.translation();
        const bp = b.body.translation();
        return Math.hypot(ap.x, ap.z) - Math.hypot(bp.x, bp.z);
      });

      this.winnerId = candidates[0]?.id;
      this.restartAt = now + RESULT_MS;
      if (this.winnerId) {
        const winner = this.slots.find((slot) => slot.id === this.winnerId);
        if (winner) winner.state = "celebrate";
        this.emitEvent("win", now, this.winnerId, undefined, 1);
      }
    }

    if (this.shouldBroadcast() || this.pendingEvents.length > 0) this.broadcast(now);
  }

  private processRespawns(now: number) {
    if (this.phase !== "playing") return;

    for (const slot of this.slots) {
      if (slot.alive || slot.respawnAt <= 0 || now < slot.respawnAt) continue;
      this.respawnSlot(slot, now);
    }
  }

  private chooseRespawnPoint(slot: Slot) {
    const index = Number(slot.id.split("-")[1]) || 0;
    const baseAngle = (index / PLAYER_COUNT) * Math.PI * 2;
    const candidateCount = Math.max(
      8,
      Math.round(GAME_TUNING.match.respawnCandidateCount),
    );
    // 设计规则：复活从场中心区域开始，而不是回到桌沿。
    const centerSpawn = {
      x: Math.cos(baseAngle) * TABLE_PUSH_GEOMETRY.arenaRadius * 0.22,
      z: Math.sin(baseAngle) * TABLE_PUSH_GEOMETRY.arenaRadius * 0.22,
    };

    let bestPoint = centerSpawn;
    let bestClearance = -1;

    for (let offset = 0; offset < candidateCount; offset += 1) {
      const angle =
        baseAngle + (offset / candidateCount) * Math.PI * 2;
      // 复活候选点分布在中心区域（半径不超过 38% 场半径），避开后向边缘靠拢。
      const radius =
        TABLE_PUSH_GEOMETRY.arenaRadius *
        (0.22 + (offset % 2 === 0 ? 0 : 0.16));
      const point = {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      };

      let minDistance = Number.POSITIVE_INFINITY;
      for (const other of this.slots) {
        if (other === slot || !other.alive) continue;
        const p = other.body.translation();
        minDistance = Math.min(
          minDistance,
          Math.hypot(p.x - point.x, p.z - point.z),
        );
      }

      if (minDistance > bestClearance) {
        bestClearance = minDistance;
        bestPoint = point;
      }
    }

    return bestPoint;
  }

  private respawnSlot(slot: Slot, now: number) {
    const spawn = this.chooseRespawnPoint(slot);
    const inward = normalize(-spawn.x, -spawn.z);

    slot.body.setEnabled(true);
    slot.body.setGravityScale(1, true);
    slot.body.setTranslation(
      {
        x: spawn.x,
        y: 1.05,
        z: spawn.z,
      },
      true,
    );
    slot.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    slot.facingYaw = Math.atan2(inward.x, inward.z);
    slot.alive = true;
    slot.respawnAt = 0;
    slot.invulnerableUntil =
      now + GAME_TUNING.match.respawnProtectionMs;
    slot.state = "recovering";
    slot.balance = 0.72;
    slot.stamina = Math.max(slot.stamina, 0.58);
    slot.staminaRecoverAt = now + 250;
    slot.koResistance = Math.max(slot.koResistance, GAME_TUNING.ko.wakeRecovery);
    slot.koUntil = 0;
    slot.wakeUntil = 0;
    slot.struggleProgress = 0;
    slot.lastStruggleAt = 0;
    slot.jumpReadyAt = now + 350;
    slot.airborneUntil = 0;
    slot.dropkickArmedUntil = 0;
    slot.kickReadyAt = now + 350;
    slot.sprinting = false;
    slot.edgeHanging = false;
    slot.edgeHangUntil = 0;
    slot.climbStartedAt = 0;
    slot.climbUntil = 0;
    slot.climbFrom = undefined;
    slot.climbTo = undefined;
    slot.knockedUntil = 0;
    slot.recoverUntil = now + 380;
    slot.pushReadyAt = slot.invulnerableUntil;
    slot.pushStateUntil = 0;
    slot.tossTargetId = undefined;
    slot.carriedBy = undefined;
    slot.tossStartedAt = 0;
    slot.tossReleaseAt = 0;
    slot.tossDirection = undefined;
    slot.tossMomentum = 0;
    slot.grabNeedsRelease = false;
    slot.lastHitBy = undefined;
    slot.lastHitAt = 0;
    slot.input = this.emptyInput();
  }

  private matchStage(now: number): MatchSnapshot["matchStage"] {
    if (this.phase === "countdown") return "opening";
    if (this.phase === "finished") return "final";

    const elapsed = Math.max(0, now - this.startedAt);
    const progress = clamp(elapsed / Math.max(1, ROUND_MS), 0, 1);
    const openingRatio =
      GAME_TUNING.match.openingEndMs / GAME_TUNING.match.roundMs;
    const brawlRatio =
      GAME_TUNING.match.brawlEndMs / GAME_TUNING.match.roundMs;
    const dangerRatio =
      GAME_TUNING.match.dangerEndMs / GAME_TUNING.match.roundMs;

    if (progress < openingRatio) return "opening";
    if (progress < brawlRatio) return "brawl";
    if (progress < dangerRatio) return "danger";
    return "final";
  }

  private currentLazySusanSpeed(now: number) {
    if (this.phase !== "playing") return 0;

    const elapsed = Math.max(0, now - this.startedAt);
    const progress = clamp(elapsed / ROUND_MS, 0, 1);
    let speed =
      GAME_TUNING.environment.lazySusanBaseSpeed +
      (GAME_TUNING.environment.lazySusanMaxSpeed -
        GAME_TUNING.environment.lazySusanBaseSpeed) *
        progress;

    if (this.matchStage(now) === "final") {
      speed *= GAME_TUNING.environment.finalTenSpeedMultiplier;
    }

    return speed;
  }

  private updateLazySusan(now: number) {
    const speed = this.currentLazySusanSpeed(now);
    if (speed <= 0) return;

    this.centerSpinRadians =
      (this.centerSpinRadians + speed / PHYSICS_HZ) %
      (Math.PI * 2);

    const maxVisualSpeed =
      GAME_TUNING.environment.lazySusanMaxSpeed *
      GAME_TUNING.environment.finalTenSpeedMultiplier;
    const speedRatio = clamp(speed / Math.max(0.01, maxVisualSpeed), 0, 1);

    for (const slot of this.slots) {
      if (
        !slot.alive ||
        slot.carriedBy ||
        slot.edgeHanging ||
        slot.state === "climbing"
      ) {
        continue;
      }

      const p = slot.body.translation();
      const radius = Math.hypot(p.x, p.z);
      if (
        radius <= 0.15 ||
        radius > TABLE_PUSH_GEOMETRY.lazySusanRadius
      ) {
        continue;
      }

      const radialRatio = clamp(
        radius / TABLE_PUSH_GEOMETRY.lazySusanRadius,
        0,
        1,
      );
      const tangent = {
        x: -p.z / radius,
        z: p.x / radius,
      };
      const impulse =
        GAME_TUNING.environment.lazySusanImpulsePerTick *
        (0.45 + speedRatio * 0.55) *
        radialRatio;

      slot.body.applyImpulse(
        {
          x: tangent.x * impulse,
          y: 0,
          z: tangent.z * impulse,
        },
        true,
      );
    }
  }

  private shouldBroadcast() {
    return this.tickCounter % SNAPSHOT_INTERVAL_TICKS === 0;
  }

  private updateStamina(slot: Slot, now: number) {
    if (slot.stamina >= GAME_TUNING.stamina.max) {
      slot.stamina = GAME_TUNING.stamina.max;
      return;
    }

    if (
      now < slot.staminaRecoverAt ||
      slot.sprinting ||
      Boolean(slot.tossTargetId)
    ) {
      return;
    }

    slot.stamina = clamp(
      slot.stamina +
        GAME_TUNING.stamina.recoveryPerSecond / PHYSICS_HZ,
      0,
      GAME_TUNING.stamina.max,
    );
  }

  private spendStamina(slot: Slot, amount: number, now: number) {
    if (slot.stamina + 1e-6 < amount) return false;

    slot.stamina = clamp(
      slot.stamina - amount,
      0,
      GAME_TUNING.stamina.max,
    );
    slot.staminaRecoverAt =
      now + GAME_TUNING.stamina.recoveryDelayAfterSpendMs;
    return true;
  }

  private maintainGrab(slot: Slot, now: number) {
    if (!slot.tossTargetId) return false;

    const target = this.slots.find(
      (candidate) => candidate.id === slot.tossTargetId,
    );

    if (
      !target ||
      !target.alive ||
      target.carriedBy !== slot.id
    ) {
      this.clearToss(slot);
      return false;
    }

    const interrupted =
      slot.edgeHanging ||
      slot.state === "hit" ||
      slot.state === "ragdoll" ||
      slot.state === "ko" ||
      slot.state === "waking" ||
      slot.state === "climbing" ||
      now < slot.knockedUntil;

    const humanReleased = !slot.bot && !slot.input.grab;
    const drained =
      GAME_TUNING.stamina.grabDrainPerSecond / PHYSICS_HZ;
    const canHold = this.spendStamina(slot, drained, now);

    if (interrupted || humanReleased || !canHold) {
      this.dropTossTarget(slot, target, now);
      if (humanReleased) slot.grabNeedsRelease = false;
      return false;
    }

    if (slot.bot && now >= slot.tossReleaseAt) {
      const direction = {
        x: Math.sin(slot.facingYaw),
        z: Math.cos(slot.facingYaw),
      };
      this.throwCarried(slot, direction, now);
      return false;
    }

    const dir = {
      x: Math.sin(slot.facingYaw),
      z: Math.cos(slot.facingYaw),
    };
    const p = slot.body.translation();

    slot.state = "grabbing";

    target.body.setGravityScale(0, true);
    target.body.setTranslation(
      {
        x: p.x + dir.x * GAME_TUNING.grab.holdForward,
        y: p.y + GAME_TUNING.grab.holdHeight,
        z: p.z + dir.z * GAME_TUNING.grab.holdForward,
      },
      true,
    );
    target.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    target.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    target.state = target.koUntil > now ? "ko" : "carried";
    return true;
  }

  private tryGrab(
    slot: Slot,
    direction: { x: number; z: number },
    now: number,
  ) {
    if (
      slot.tossTargetId ||
      slot.edgeHanging ||
      now < slot.invulnerableUntil ||
      slot.grabNeedsRelease ||
      slot.stamina <= GAME_TUNING.stamina.exhaustedThreshold
    ) {
      return false;
    }

    const origin = slot.body.translation();
    let best: Slot | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    let dx = direction.x;
    let dz = direction.z;
    if (Math.hypot(dx, dz) < 0.05) {
      dx = Math.sin(slot.facingYaw);
      dz = Math.cos(slot.facingYaw);
    }
    const dir = normalize(dx, dz);

    for (const candidate of this.slots) {
      if (
        candidate === slot ||
        !candidate.alive ||
        now < candidate.invulnerableUntil ||
        candidate.carriedBy ||
        candidate.edgeHanging ||
        candidate.state === "climbing"
      ) {
        continue;
      }

      const p = candidate.body.translation();
      const rx = p.x - origin.x;
      const rz = p.z - origin.z;
      const distance = Math.hypot(rx, rz);
      if (
        distance > GAME_TUNING.grab.range ||
        distance < 0.001
      ) {
        continue;
      }

      const targetDir = normalize(rx, rz);
      const facing = dir.x * targetDir.x + dir.z * targetDir.z;
      if (facing < GAME_TUNING.grab.minimumFacingDot) continue;

      const score =
        distance +
        candidate.balance * GAME_TUNING.grab.targetBalanceBias;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best) return false;

    slot.tossTargetId = best.id;
    slot.tossStartedAt = now;
    slot.tossReleaseAt = now + GAME_TUNING.grab.botHoldMs;
    slot.tossDirection = { x: dir.x, z: dir.z };
    slot.tossMomentum = clamp(
      Math.hypot(slot.body.linvel().x, slot.body.linvel().z) /
        GAME_TUNING.push.momentumReferenceSpeed,
      0,
      1,
    );
    slot.grabNeedsRelease = !slot.bot;
    slot.state = "grabbing";
    slot.facingYaw = Math.atan2(dir.x, dir.z);

    best.carriedBy = slot.id;
    best.struggleProgress = 0;
    best.lastStruggleAt = 0;
    best.edgeHanging = false;
    best.body.setGravityScale(0, true);
    best.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    best.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    best.state = "carried";

    this.emitEvent("grab", now, slot.id, best.id, 0.45);
    return true;
  }

  private throwCarried(
    slot: Slot,
    direction: { x: number; z: number },
    now: number,
  ) {
    if (!slot.tossTargetId) return false;

    const target = this.slots.find(
      (candidate) =>
        candidate.id === slot.tossTargetId &&
        candidate.carriedBy === slot.id,
    );
    if (!target) {
      this.clearToss(slot);
      return false;
    }

    if (!this.spendStamina(slot, GAME_TUNING.stamina.throwCost, now)) {
      this.dropTossTarget(slot, target, now);
      return false;
    }

    let dx = direction.x;
    let dz = direction.z;
    if (Math.hypot(dx, dz) < 0.05) {
      dx = Math.sin(slot.facingYaw);
      dz = Math.cos(slot.facingYaw);
    }
    const dir = normalize(dx, dz);
    const velocity = slot.body.linvel();
    const runUp = clamp(
      Math.hypot(velocity.x, velocity.z) /
        GAME_TUNING.push.momentumReferenceSpeed,
      0,
      1,
    );
    const strength =
      GAME_TUNING.toss.baseStrength *
      (1 + runUp * GAME_TUNING.toss.momentumBonus);

    target.body.setGravityScale(1, true);
    target.carriedBy = undefined;
    target.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    target.body.applyImpulse(
      {
        x: dir.x * strength,
        y: GAME_TUNING.toss.verticalStrength,
        z: dir.z * strength,
      },
      true,
    );
    target.body.applyTorqueImpulse(
      {
        x: dir.z * 0.34,
        y: (slot.botOrbit || 1) * 0.22,
        z: -dir.x * 0.34,
      },
      true,
    );
    target.balance = GAME_TUNING.toss.targetBalanceAfter;
    target.state = "ragdoll";
    target.knockedUntil = now + GAME_TUNING.toss.knockdownMs;
    target.lastHitBy = slot.id;
    target.lastHitAt = now;

    slot.state = "throwing";
    slot.pushStateUntil = now + GAME_TUNING.toss.attackerLockMs;
    slot.pushReadyAt = Math.max(
      slot.pushReadyAt,
      now + GAME_TUNING.toss.cooldownMs,
    );

    const targetId = target.id;
    const importance = clamp(0.8 + runUp * 0.2, 0, 1);
    this.clearToss(slot);
    this.emitEvent("toss", now, slot.id, targetId, importance);
    return true;
  }

  private releaseActiveTosses(now: number) {
    for (const slot of this.slots) {
      if (!slot.tossTargetId) continue;
      const target = this.slots.find(
        (candidate) =>
          candidate.id === slot.tossTargetId &&
          candidate.carriedBy === slot.id,
      );
      if (target) this.dropTossTarget(slot, target, now);
      else this.clearToss(slot);
    }
  }

  private dropTossTarget(slot: Slot, target: Slot, now: number) {
    target.body.setGravityScale(1, true);
    target.carriedBy = undefined;
    target.struggleProgress = 0;
    target.lastStruggleAt = 0;
    target.state = target.koUntil > now ? "ko" : "ragdoll";
    target.balance = Math.min(target.balance, 0.28);
    target.knockedUntil = Math.max(
      target.knockedUntil,
      target.koUntil > now ? target.koUntil : now + 260,
    );
    this.clearToss(slot);
  }

  private clearToss(slot: Slot) {
    slot.tossTargetId = undefined;
    slot.tossStartedAt = 0;
    slot.tossReleaseAt = 0;
    slot.tossDirection = undefined;
    slot.tossMomentum = 0;
  }

  private advanceRecovery(slot: Slot, now: number) {
    if (slot.edgeHanging || slot.state === "climbing") return;

    if (slot.state === "dropkicking" && now >= slot.pushStateUntil) {
      slot.state = "ragdoll";
      slot.knockedUntil = Math.max(
        slot.knockedUntil,
        now + GAME_TUNING.dropkick.selfKnockdownMs,
      );
    }

    if ((slot.state === "hit" || slot.state === "ragdoll") && now >= slot.knockedUntil) {
      slot.state = "recovering";
      slot.recoverUntil = now + GAME_TUNING.balance.recoveryStateBaseMs + (1 - slot.balance) * GAME_TUNING.balance.recoveryStateBalanceMs;
    }

    const recovering = slot.state === "recovering";
    const hardStunned =
      (slot.state === "hit" || slot.state === "ragdoll") &&
      now < slot.knockedUntil;
    const recoveryPerSecond = recovering
      ? GAME_TUNING.balance.recoveringPerSecond
      : hardStunned
        ? 0
        : GAME_TUNING.balance.passivePerSecond;

    slot.balance = clamp(
      slot.balance + recoveryPerSecond / PHYSICS_HZ,
      0,
      1,
    );

    if (recovering && now >= slot.recoverUntil) {
      this.snapUpright(slot);
      slot.balance = Math.max(
        slot.balance,
        GAME_TUNING.balance.recoverySnapBalance,
      );
      slot.state = "idle";
    }
  }

  private snapUpright(slot: Slot) {
    const halfYaw = slot.facingYaw * 0.5;
    slot.body.setRotation(
      {
        x: 0,
        y: Math.sin(halfYaw),
        z: 0,
        w: Math.cos(halfYaw),
      },
      true,
    );

    const angular = slot.body.angvel();
    slot.body.setAngvel(
      {
        x: 0,
        y: angular.y * 0.35,
        z: 0,
      },
      true,
    );
  }

  private stabilizeStanding(slot: Slot, now: number) {
    if (
      !slot.alive ||
      slot.carriedBy ||
      slot.edgeHanging ||
      now < slot.knockedUntil ||
      slot.balance < GAME_TUNING.balance.stableUprightMinBalance
    ) {
      return;
    }

    const stableState =
      slot.state === "idle" ||
      slot.state === "moving" ||
      slot.state === "pushing" ||
      slot.state === "grabbing" ||
      slot.state === "throwing" ||
      slot.state === "kicking" ||
      slot.state === "headbutting" ||
      slot.state === "celebrate";

    if (!stableState) return;

    // Hybrid active-ragdoll rule:
    // stable gameplay states are upright; designated hit/ragdoll/recovery
    // states are the only time X/Z body rotation is allowed to persist.
    this.snapUpright(slot);
  }

  private advanceClimb(slot: Slot, now: number) {
    if (slot.state !== "climbing" || !slot.climbFrom || !slot.climbTo) return false;

    const duration = Math.max(1, slot.climbUntil - slot.climbStartedAt);
    const t = clamp((now - slot.climbStartedAt) / duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const from = slot.climbFrom;
    const to = slot.climbTo;

    slot.body.setTranslation(
      {
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
        z: from.z + (to.z - from.z) * eased,
      },
      true,
    );
    slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    if (t >= 1) {
      slot.body.setGravityScale(1, true);
      slot.balance = Math.max(slot.balance, GAME_TUNING.ledge.successfulClimbBalance);
      slot.state = "recovering";
      slot.recoverUntil = now + GAME_TUNING.ledge.climbRecoveryMs;
      slot.climbFrom = undefined;
      slot.climbTo = undefined;
    }

    return true;
  }

  private applyUprightAssist(slot: Slot, now: number) {
    if (!slot.alive || slot.edgeHanging || now < slot.knockedUntil) return;

    const q = slot.body.rotation();
    const upX = 2 * (q.x * q.y - q.z * q.w);
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const upZ = 2 * (q.y * q.z + q.x * q.w);
    const tilt = Math.acos(clamp(upY, -1, 1));

    if (tilt < 0.025) return;

    const p = slot.body.translation();
    const radius = Math.hypot(p.x, p.z);
    const edgeSupport = clamp((TABLE_PUSH_GEOMETRY.arenaRadius - radius + 0.12) / 0.9, 0.12, 1);
    const balanceAssist = 0.22 + slot.balance * 0.78;
    const recoveryBoost = slot.state === "recovering"
      ? GAME_TUNING.balance.uprightRecoveryBoost
      : 1;
    const strength =
      Math.min(
        GAME_TUNING.balance.uprightMaxTorque,
        tilt * GAME_TUNING.balance.uprightTiltFactor,
      ) *
      recoveryBoost *
      balanceAssist *
      edgeSupport;

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
    const edgeDistance = TABLE_PUSH_GEOMETRY.arenaRadius - radius;

    if (edgeDistance < slot.botEdgeCaution) {
      const inward = normalize(-p.x, -p.z);
      const tangent = { x: -inward.z * slot.botOrbit, z: inward.x * slot.botOrbit };
      const panic = clamp(
        (slot.botEdgeCaution - edgeDistance) / Math.max(0.55, slot.botEdgeCaution * 0.58),
        0,
        1,
      );
      return normalize(
        inward.x * (1 + panic * 1.6) + tangent.x * 0.2,
        inward.z * (1 + panic * 1.6) + tangent.z * 0.2,
      );
    }

    let target = this.slots.find(
      (candidate) =>
        candidate.id === slot.botTargetId &&
        candidate !== slot &&
        candidate.alive &&
        now >= candidate.invulnerableUntil,
    );

    if (!target || now >= slot.botRetargetAt) {
      let best = Number.POSITIVE_INFINITY;
      target = undefined;

      for (const candidate of this.slots) {
        if (
          candidate === slot ||
          !candidate.alive ||
          now < candidate.invulnerableUntil
        ) {
          continue;
        }
        const c = candidate.body.translation();
        const distance = Math.hypot(c.x - p.x, c.z - p.z);
        const existingFocus = this.slots.filter(
          (other) => other !== slot && other.botTargetId === candidate.id,
        ).length;
        const targetRadius = Math.hypot(c.x, c.z);
        const edgeExposure = clamp(
          (targetRadius - TABLE_PUSH_GEOMETRY.dangerStartRadius) /
            Math.max(
              0.1,
              TABLE_PUSH_GEOMETRY.arenaRadius -
                TABLE_PUSH_GEOMETRY.dangerStartRadius,
            ),
          0,
          1,
        );
        const crowdPenalty = existingFocus * (candidate.bot ? 1.05 : 1.4);
        const edgeOpportunity = edgeExposure * slot.botEdgeHunter * 1.6;
        const distanceWeight = 1.12 - slot.botAggression * 0.28;
        const score = distance * distanceWeight + crowdPenalty - edgeOpportunity;

        if (score < best) {
          best = score;
          target = candidate;
        }
      }

      slot.botTargetId = target?.id;
      const personalityDelay = 760 - slot.botAggression * 190;
      slot.botRetargetAt =
        now +
        personalityDelay +
        (Number(slot.id.split("-")[1]) % 4) * 110;
    }

    if (!target) return { x: 0, z: 0 };

    const t = target.body.translation();
    const direct = normalize(t.x - p.x, t.z - p.z);
    const distance = Math.hypot(t.x - p.x, t.z - p.z);
    const orbitAmount = distance > 1.7 ? slot.botOrbitStrength : 0.04;
    const tangent = { x: -direct.z * slot.botOrbit, z: direct.x * slot.botOrbit };

    return normalize(
      direct.x + tangent.x * orbitAmount,
      direct.z + tangent.z * orbitAmount,
    );
  }

  private drive(slot: Slot, direction: { x: number; z: number }, now: number) {
    if (slot.edgeHanging || now < slot.knockedUntil) {
      slot.sprinting = false;
      return;
    }

    const magnitude = Math.hypot(direction.x, direction.z);
    const attackLocked =
      (
        slot.state === "pushing" ||
        slot.state === "throwing" ||
        slot.state === "kicking" ||
        slot.state === "headbutting" ||
        slot.state === "dropkicking"
      ) &&
      now < slot.pushStateUntil;
    const jumping = slot.state === "jumping" && now < slot.airborneUntil;

    if (magnitude < 0.05) {
      slot.sprinting = false;
      if (
        slot.state !== "recovering" &&
        !attackLocked &&
        !jumping &&
        !slot.tossTargetId
      ) {
        slot.state = "idle";
      }
      return;
    }

    const botSprint =
      slot.bot &&
      slot.botAggression >= 0.78 &&
      !slot.tossTargetId &&
      slot.stamina > 0.24;
    const sprintRequested =
      !slot.tossTargetId &&
      (slot.bot ? botSprint : slot.input.sprint) &&
      slot.stamina > GAME_TUNING.stamina.exhaustedThreshold;

    if (sprintRequested) {
      slot.sprinting = this.spendStamina(
        slot,
        GAME_TUNING.stamina.sprintDrainPerSecond / PHYSICS_HZ,
        now,
      );
    } else {
      slot.sprinting = false;
    }

    const controlScale = slot.state === "recovering"
      ? GAME_TUNING.movement.recoveryControlScale
      : attackLocked
        ? GAME_TUNING.movement.attackControlScale
        : 1;
    const balanceControl =
      GAME_TUNING.movement.minBalanceControl +
      slot.balance * (1 - GAME_TUNING.movement.minBalanceControl);
    const carryScale = slot.tossTargetId
      ? GAME_TUNING.movement.carryMoveScale
      : 1;
    const sprintScale = slot.sprinting
      ? GAME_TUNING.movement.sprintImpulseMultiplier
      : 1;
    const moveScale =
      (slot.bot ? slot.botMoveScale : 1) *
      balanceControl *
      carryScale *
      sprintScale;

    if (
      slot.state !== "recovering" &&
      !attackLocked &&
      !jumping &&
      !slot.tossTargetId
    ) {
      slot.state = "moving";
    }

    slot.facingYaw = Math.atan2(direction.x, direction.z);
    slot.body.applyImpulse(
      {
        x:
          direction.x *
          GAME_TUNING.movement.impulsePerTick *
          controlScale *
          moveScale,
        y: 0,
        z:
          direction.z *
          GAME_TUNING.movement.impulsePerTick *
          controlScale *
          moveScale,
      },
      true,
    );

    const velocity = slot.body.linvel();
    const horizontal = Math.hypot(velocity.x, velocity.z);
    const maxSpeed =
      GAME_TUNING.movement.maxHorizontalSpeed *
      (slot.sprinting
        ? GAME_TUNING.movement.sprintMaxSpeedMultiplier
        : 1) *
      (slot.tossTargetId ? GAME_TUNING.movement.carryMoveScale : 1);

    if (horizontal > maxSpeed) {
      const scale = maxSpeed / horizontal;
      slot.body.setLinvel(
        { x: velocity.x * scale, y: velocity.y, z: velocity.z * scale },
        true,
      );
    }
  }


  private recoverKoResistance(slot: Slot, now: number) {
    if (
      slot.state === "ko" ||
      slot.state === "waking" ||
      now - slot.lastHitAt < 1_000
    ) {
      return;
    }

    slot.koResistance = clamp(
      slot.koResistance +
        GAME_TUNING.ko.passiveRecoveryPerSecond / PHYSICS_HZ,
      0,
      GAME_TUNING.ko.maxResistance,
    );
  }

  private advanceKoState(slot: Slot, now: number) {
    if (slot.state === "ko") {
      slot.sprinting = false;
      if (now < slot.koUntil) return true;

      slot.state = "waking";
      slot.wakeUntil = now + GAME_TUNING.ko.wakeDurationMs;
      slot.invulnerableUntil = Math.max(
        slot.invulnerableUntil,
        slot.wakeUntil + GAME_TUNING.ko.wakeProtectionMs,
      );
      slot.koResistance = Math.max(
        slot.koResistance,
        GAME_TUNING.ko.wakeRecovery,
      );
      this.emitEvent("wake", now, slot.id, undefined, 0.38);
      return true;
    }

    if (slot.state === "waking") {
      slot.sprinting = false;
      if (now < slot.wakeUntil) return true;
      this.snapUpright(slot);
      slot.balance = Math.max(slot.balance, 0.58);
      slot.state = "recovering";
      slot.recoverUntil = now + 260;
    }

    return false;
  }

  private enterKo(slot: Slot, now: number, actorId?: string) {
    if (slot.state === "ko" || slot.state === "waking") return;

    if (slot.tossTargetId) {
      const carried = this.slots.find(
        (candidate) =>
          candidate.id === slot.tossTargetId &&
          candidate.carriedBy === slot.id,
      );
      if (carried) this.dropTossTarget(slot, carried, now);
      else this.clearToss(slot);
    }

    const deficit = clamp(
      1 - slot.koResistance / GAME_TUNING.ko.maxResistance,
      0,
      1,
    );
    const duration =
      GAME_TUNING.ko.minDurationMs +
      (GAME_TUNING.ko.maxDurationMs - GAME_TUNING.ko.minDurationMs) *
        deficit;

    slot.state = "ko";
    slot.koUntil = now + duration;
    slot.knockedUntil = Math.max(slot.knockedUntil, slot.koUntil);
    slot.balance = Math.min(slot.balance, 0.08);
    slot.sprinting = false;
    slot.body.applyTorqueImpulse(
      { x: 0.12, y: 0.04, z: -0.1 },
      true,
    );
    this.emitEvent("ko", now, actorId, slot.id, clamp(0.72 + deficit * 0.28, 0, 1));
  }

  private applyKoDamage(
    slot: Slot,
    amount: number,
    now: number,
    actorId?: string,
  ) {
    if (now < slot.invulnerableUntil || slot.state === "ko") return;
    slot.koResistance = clamp(
      slot.koResistance - amount,
      0,
      GAME_TUNING.ko.maxResistance,
    );
    if (slot.koResistance <= 0.001) this.enterKo(slot, now, actorId);
  }

  private processCarriedStruggle(slot: Slot, now: number) {
    const holder = this.slots.find(
      (candidate) => candidate.id === slot.carriedBy && candidate.alive,
    );
    if (!holder) {
      slot.carriedBy = undefined;
      slot.body.setGravityScale(1, true);
      return;
    }

    if (slot.koUntil > now) {
      slot.state = "ko";
      slot.struggleProgress = 0;
      return;
    }

    if (slot.koUntil > 0 && now >= slot.koUntil) {
      slot.koUntil = 0;
      slot.koResistance = Math.max(
        slot.koResistance,
        GAME_TUNING.ko.wakeRecovery,
      );
      slot.state = "carried";
      this.emitEvent("wake", now, slot.id, undefined, 0.3);
    }

    slot.struggleProgress = Math.max(
      0,
      slot.struggleProgress -
        GAME_TUNING.struggle.decayPerSecond / PHYSICS_HZ,
    );

    if (slot.bot) return;
    const pressed = slot.input.attack || slot.input.push || slot.input.kick;
    if (
      !pressed ||
      now - slot.lastStruggleAt < GAME_TUNING.struggle.minPressIntervalMs ||
      !this.spendStamina(slot, GAME_TUNING.stamina.struggleCost, now)
    ) {
      return;
    }

    slot.lastStruggleAt = now;
    slot.struggleProgress += GAME_TUNING.struggle.perPress;
    holder.stamina = clamp(
      holder.stamina - GAME_TUNING.struggle.holderStaminaDamage,
      0,
      GAME_TUNING.stamina.max,
    );

    if (slot.struggleProgress + 1e-6 < GAME_TUNING.struggle.breakThreshold) {
      return;
    }

    const hp = holder.body.translation();
    const sp = slot.body.translation();
    const away = normalize(sp.x - hp.x, sp.z - hp.z);
    this.dropTossTarget(holder, slot, now);
    slot.struggleProgress = 0;
    slot.state = "recovering";
    slot.recoverUntil = now + 260;
    slot.body.applyImpulse(
      { x: away.x * 1.2, y: 0.32, z: away.z * 1.2 },
      true,
    );
    holder.state = "hit";
    holder.knockedUntil = Math.max(holder.knockedUntil, now + 180);
    this.emitEvent("struggle_break", now, slot.id, holder.id, 0.72);
  }

  private jump(
    slot: Slot,
    direction: { x: number; z: number },
    now: number,
  ) {
    if (
      slot.edgeHanging ||
      slot.tossTargetId ||
      now < slot.invulnerableUntil ||
      now < slot.jumpReadyAt ||
      now < slot.knockedUntil ||
      slot.state === "ko" ||
      slot.state === "waking"
    ) {
      return false;
    }

    if (!this.spendStamina(slot, GAME_TUNING.stamina.jumpCost, now)) {
      return false;
    }

    let dx = direction.x;
    let dz = direction.z;
    if (Math.hypot(dx, dz) < 0.05) {
      dx = Math.sin(slot.facingYaw);
      dz = Math.cos(slot.facingYaw);
    }
    const dir = normalize(dx, dz);
    const velocity = slot.body.linvel();
    const speed = Math.hypot(velocity.x, velocity.z);
    const sprintArmed =
      slot.sprinting ||
      (!slot.bot &&
        slot.input.sprint &&
        speed >= GAME_TUNING.movement.maxHorizontalSpeed * 0.55);

    slot.facingYaw = Math.atan2(dir.x, dir.z);
    slot.jumpReadyAt = now + GAME_TUNING.jump.cooldownMs;
    slot.airborneUntil = now + GAME_TUNING.jump.airborneWindowMs;
    slot.dropkickArmedUntil = sprintArmed ? slot.airborneUntil : 0;
    slot.state = "jumping";
    slot.sprinting = false;
    slot.body.applyImpulse(
      {
        x: dir.x * GAME_TUNING.jump.forwardImpulse,
        y: GAME_TUNING.jump.verticalImpulse,
        z: dir.z * GAME_TUNING.jump.forwardImpulse,
      },
      true,
    );
    return true;
  }

  private kickAction(
    slot: Slot,
    direction: { x: number; z: number },
    now: number,
  ) {
    if (
      !slot.alive ||
      slot.edgeHanging ||
      now < slot.invulnerableUntil ||
      now < slot.kickReadyAt ||
      now < slot.knockedUntil
    ) {
      return false;
    }

    if (slot.tossTargetId) {
      return this.headbutt(slot, now);
    }

    if (now < slot.dropkickArmedUntil) {
      return this.dropkick(slot, direction, now);
    }

    if (!this.spendStamina(slot, GAME_TUNING.stamina.kickCost, now)) {
      return false;
    }

    let dx = direction.x;
    let dz = direction.z;
    if (Math.hypot(dx, dz) < 0.05) {
      dx = Math.sin(slot.facingYaw);
      dz = Math.cos(slot.facingYaw);
    }
    const dir = normalize(dx, dz);

    slot.facingYaw = Math.atan2(dir.x, dir.z);
    slot.kickReadyAt = now + GAME_TUNING.kick.cooldownMs;
    slot.pushStateUntil = now + GAME_TUNING.kick.animationHoldMs;
    slot.state = "kicking";

    const origin = slot.body.translation();
    for (const target of this.slots) {
      if (
        target === slot ||
        !target.alive ||
        target.carriedBy ||
        now < target.invulnerableUntil
      ) {
        continue;
      }

      const p = target.body.translation();
      const rx = p.x - origin.x;
      const rz = p.z - origin.z;
      const distance = Math.hypot(rx, rz);
      if (distance > GAME_TUNING.kick.hitRange || distance < 0.001) continue;

      const radial = normalize(rx, rz);
      const facing = dir.x * radial.x + dir.z * radial.z;
      if (facing < GAME_TUNING.kick.minimumFacingDot) continue;

      const proneBonus =
        target.state === "ragdoll" ||
        target.state === "recovering" ||
        target.state === "edge_hang"
          ? 1.22
          : 1;
      target.body.applyImpulseAtPoint(
        {
          x: radial.x * GAME_TUNING.kick.strength * proneBonus,
          y: GAME_TUNING.kick.verticalHitImpulse,
          z: radial.z * GAME_TUNING.kick.strength * proneBonus,
        },
        { x: p.x, y: p.y + 0.2, z: p.z },
        true,
      );
      target.balance = clamp(
        target.balance - GAME_TUNING.kick.balanceLoss * proneBonus,
        GAME_TUNING.balance.minimumAfterHit,
        1,
      );
      target.state = "hit";
      target.knockedUntil = Math.max(
        target.knockedUntil,
        now + GAME_TUNING.kick.staggerMs,
      );
      target.lastHitBy = slot.id;
      target.lastHitAt = now;
      this.applyKoDamage(
        target,
        GAME_TUNING.ko.kickDamage * proneBonus,
        now,
        slot.id,
      );
      this.emitEvent("kick_hit", now, slot.id, target.id, 0.58 * proneBonus);
      break;
    }

    return true;
  }

  private headbutt(slot: Slot, now: number) {
    const target = this.slots.find(
      (candidate) =>
        candidate.id === slot.tossTargetId &&
        candidate.carriedBy === slot.id &&
        candidate.alive,
    );
    if (!target) return false;
    if (!this.spendStamina(slot, GAME_TUNING.stamina.headbuttCost, now)) {
      return false;
    }

    slot.kickReadyAt = now + GAME_TUNING.headbutt.cooldownMs;
    slot.pushStateUntil = now + GAME_TUNING.headbutt.animationHoldMs;
    slot.state = "headbutting";
    slot.balance = Math.max(
      GAME_TUNING.balance.minimumAfterHit,
      slot.balance - GAME_TUNING.headbutt.selfBalanceLoss,
    );

    target.balance = clamp(
      target.balance - GAME_TUNING.headbutt.balanceLoss,
      GAME_TUNING.balance.minimumAfterHit,
      1,
    );
    target.lastHitBy = slot.id;
    target.lastHitAt = now;
    this.applyKoDamage(
      target,
      GAME_TUNING.headbutt.koDamage,
      now,
      slot.id,
    );
    this.emitEvent("headbutt_hit", now, slot.id, target.id, 0.78);
    return true;
  }

  private dropkick(
    slot: Slot,
    direction: { x: number; z: number },
    now: number,
  ) {
    if (!this.spendStamina(slot, GAME_TUNING.stamina.dropkickCost, now)) {
      return false;
    }

    let dx = direction.x;
    let dz = direction.z;
    if (Math.hypot(dx, dz) < 0.05) {
      dx = Math.sin(slot.facingYaw);
      dz = Math.cos(slot.facingYaw);
    }
    const dir = normalize(dx, dz);

    slot.facingYaw = Math.atan2(dir.x, dir.z);
    slot.dropkickArmedUntil = 0;
    slot.airborneUntil = Math.max(slot.airborneUntil, now + 220);
    slot.kickReadyAt = now + GAME_TUNING.dropkick.cooldownMs;
    slot.pushReadyAt = Math.max(slot.pushReadyAt, slot.kickReadyAt);
    slot.pushStateUntil = now + GAME_TUNING.dropkick.animationHoldMs;
    slot.state = "dropkicking";
    slot.sprinting = false;
    slot.body.applyImpulse(
      {
        x: dir.x * GAME_TUNING.dropkick.forwardImpulse,
        y: GAME_TUNING.dropkick.verticalImpulse,
        z: dir.z * GAME_TUNING.dropkick.forwardImpulse,
      },
      true,
    );

    const origin = slot.body.translation();
    let hit = false;
    for (const target of this.slots) {
      if (
        target === slot ||
        !target.alive ||
        target.carriedBy ||
        now < target.invulnerableUntil
      ) {
        continue;
      }

      const p = target.body.translation();
      const rx = p.x - origin.x;
      const rz = p.z - origin.z;
      const distance = Math.hypot(rx, rz);
      if (
        distance > GAME_TUNING.dropkick.hitRange ||
        distance < 0.001
      ) {
        continue;
      }

      const radial = normalize(rx, rz);
      const facing = dir.x * radial.x + dir.z * radial.z;
      if (facing < GAME_TUNING.dropkick.minimumFacingDot) continue;

      target.body.applyImpulseAtPoint(
        {
          x: radial.x * GAME_TUNING.dropkick.strength,
          y: GAME_TUNING.dropkick.verticalHitImpulse,
          z: radial.z * GAME_TUNING.dropkick.strength,
        },
        { x: p.x, y: p.y + 0.42, z: p.z },
        true,
      );
      target.body.applyTorqueImpulse(
        { x: radial.z * 0.34, y: 0.12, z: -radial.x * 0.34 },
        true,
      );
      target.balance = clamp(
        target.balance - GAME_TUNING.dropkick.balanceLoss,
        GAME_TUNING.balance.minimumAfterHit,
        1,
      );
      target.state = "ragdoll";
      target.knockedUntil = Math.max(
        target.knockedUntil,
        now + GAME_TUNING.dropkick.targetKnockdownMs,
      );
      target.lastHitBy = slot.id;
      target.lastHitAt = now;
      this.applyKoDamage(
        target,
        GAME_TUNING.dropkick.koDamage,
        now,
        slot.id,
      );
      this.emitEvent("dropkick_hit", now, slot.id, target.id, 1);
      hit = true;
      break;
    }

    slot.body.applyTorqueImpulse(
      { x: dir.z * 0.24, y: hit ? 0.08 : 0.14, z: -dir.x * 0.24 },
      true,
    );
    return true;
  }

  private shouldBotGrab(slot: Slot, now: number) {
    if (
      slot.tossTargetId ||
      now < slot.pushReadyAt ||
      slot.stamina <= 0.24
    ) {
      return false;
    }

    const target = this.slots.find(
      (candidate) =>
        candidate.id === slot.botTargetId &&
        candidate !== slot &&
        candidate.alive &&
        now >= candidate.invulnerableUntil &&
        !candidate.carriedBy,
    );
    if (!target) return false;

    const vulnerable =
      target.balance <= 0.5 ||
      target.state === "hit" ||
      target.state === "ragdoll" ||
      target.state === "recovering";
    if (!vulnerable) return false;

    const p = slot.body.translation();
    const t = target.body.translation();
    return (
      Math.hypot(t.x - p.x, t.z - p.z) <=
      GAME_TUNING.grab.range
    );
  }

  private shouldBotPush(slot: Slot, now: number) {
    if (now < slot.pushReadyAt) return false;

    const target = this.slots.find(
      (candidate) =>
        candidate.id === slot.botTargetId &&
        candidate !== slot &&
        candidate.alive &&
        now >= candidate.invulnerableUntil,
    );
    if (!target) return false;

    const p = slot.body.translation();
    const t = target.body.translation();
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance > slot.botPushRange || distance < 0.001) return false;

    const targetDir = normalize(dx, dz);
    const facingDir = {
      x: Math.sin(slot.facingYaw),
      z: Math.cos(slot.facingYaw),
    };
    const facing = facingDir.x * targetDir.x + facingDir.z * targetDir.z;

    return facing >= slot.botPushFacing;
  }

  private attack(
    slot: Slot,
    direction: { x: number; z: number },
    now: number,
  ) {
    if (
      !slot.alive ||
      slot.edgeHanging ||
      now < slot.invulnerableUntil ||
      now < slot.pushReadyAt
    ) {
      return;
    }

    let dx = direction.x;
    let dz = direction.z;
    if (Math.hypot(dx, dz) < 0.05) {
      const velocity = slot.body.linvel();
      const fallback = normalize(velocity.x, velocity.z);
      dx = fallback.x || Math.sin(slot.facingYaw);
      dz = fallback.z || Math.cos(slot.facingYaw);
    }

    const dir = normalize(dx, dz);
    const preAttackVelocity = slot.body.linvel();
    const preAttackSpeed = Math.hypot(
      preAttackVelocity.x,
      preAttackVelocity.z,
    );
    const runUp = clamp(
      preAttackSpeed / GAME_TUNING.push.momentumReferenceSpeed,
      0,
      1,
    );

    const wantsHeavy =
      slot.sprinting &&
      runUp >= 0.52 &&
      slot.stamina >= GAME_TUNING.stamina.heavyCost;

    if (wantsHeavy) {
      if (!this.spendStamina(slot, GAME_TUNING.stamina.heavyCost, now)) {
        return;
      }
      this.heavyStrike(slot, dir, runUp, now);
      return;
    }

    if (!this.spendStamina(slot, GAME_TUNING.stamina.punchCost, now)) {
      return;
    }
    this.punch(slot, dir, now);
  }

  private punch(
    slot: Slot,
    dir: { x: number; z: number },
    now: number,
  ) {
    slot.sprinting = false;
    slot.facingYaw = Math.atan2(dir.x, dir.z);
    slot.pushReadyAt =
      now +
      GAME_TUNING.punch.cooldownMs *
        (slot.bot ? slot.botCooldownScale : 1);
    slot.pushStateUntil = now + GAME_TUNING.punch.animationHoldMs;
    slot.state = "pushing";
    slot.body.applyImpulse(
      {
        x: dir.x * GAME_TUNING.punch.lungeImpulse,
        y: 0,
        z: dir.z * GAME_TUNING.punch.lungeImpulse,
      },
      true,
    );

    const origin = slot.body.translation();
    for (const target of this.slots) {
      if (
        target === slot ||
        !target.alive ||
        now < target.invulnerableUntil ||
        target.carriedBy
      ) {
        continue;
      }
      const p = target.body.translation();
      const rx = p.x - origin.x;
      const rz = p.z - origin.z;
      const distance = Math.hypot(rx, rz);
      if (
        distance > GAME_TUNING.punch.hitRange ||
        distance < 0.001
      ) {
        continue;
      }

      const radial = normalize(rx, rz);
      const facing = dir.x * radial.x + dir.z * radial.z;
      if (facing < GAME_TUNING.punch.minimumFacingDot) continue;

      const distanceScale = clamp(
        1 - distance / GAME_TUNING.punch.hitRange,
        0.35,
        1,
      );
      const strength =
        GAME_TUNING.punch.maxStrength * distanceScale;

      target.body.applyImpulseAtPoint(
        {
          x: radial.x * strength,
          y: GAME_TUNING.punch.verticalHitImpulse,
          z: radial.z * strength,
        },
        { x: p.x, y: p.y + 0.45, z: p.z },
        true,
      );
      target.body.applyTorqueImpulse(
        {
          x: radial.z * 0.055,
          y: slot.botOrbit * 0.035,
          z: -radial.x * 0.055,
        },
        true,
      );
      target.balance = clamp(
        target.balance - GAME_TUNING.punch.balanceLoss,
        GAME_TUNING.balance.minimumAfterHit,
        1,
      );
      target.state = "hit";
      target.knockedUntil = Math.max(
        target.knockedUntil,
        now + GAME_TUNING.punch.staggerMs,
      );
      target.lastHitBy = slot.id;
      target.lastHitAt = now;
      this.applyKoDamage(
        target,
        GAME_TUNING.ko.punchDamage * distanceScale,
        now,
        slot.id,
      );
      this.emitEvent(
        "punch_hit",
        now,
        slot.id,
        target.id,
        0.38 + distanceScale * 0.22,
      );
      break;
    }
  }

  private heavyStrike(
    slot: Slot,
    dir: { x: number; z: number },
    runUp: number,
    now: number,
  ) {
    const momentumMultiplier =
      GAME_TUNING.push.momentumMinMultiplier +
      (GAME_TUNING.push.momentumMaxMultiplier -
        GAME_TUNING.push.momentumMinMultiplier) *
        runUp;

    slot.sprinting = false;
    slot.facingYaw = Math.atan2(dir.x, dir.z);
    slot.pushReadyAt =
      now +
      GAME_TUNING.push.cooldownMs *
        (slot.bot ? slot.botCooldownScale : 1);
    slot.pushStateUntil = now + GAME_TUNING.push.animationHoldMs;
    slot.state = "pushing";
    slot.body.applyImpulse(
      {
        x: dir.x * GAME_TUNING.push.lungeImpulse,
        y: GAME_TUNING.push.lungeLift,
        z: dir.z * GAME_TUNING.push.lungeImpulse,
      },
      true,
    );

    const origin = slot.body.translation();

    for (const target of this.slots) {
      if (
        target === slot ||
        !target.alive ||
        now < target.invulnerableUntil ||
        target.carriedBy
      ) {
        continue;
      }
      const p = target.body.translation();
      const rx = p.x - origin.x;
      const rz = p.z - origin.z;
      const distance = Math.hypot(rx, rz);
      if (
        distance > GAME_TUNING.push.hitRange ||
        distance < 0.001
      ) {
        continue;
      }

      const radial = normalize(rx, rz);
      const facing = dir.x * radial.x + dir.z * radial.z;
      if (facing < GAME_TUNING.push.minimumFacingDot) continue;

      const strength =
        Math.max(
          0.8,
          GAME_TUNING.push.maxStrength *
            (1 - distance / GAME_TUNING.push.falloffDistance),
        ) * momentumMultiplier;
      const impact = clamp(
        strength / GAME_TUNING.push.maxStrength,
        0,
        1,
      );

      target.body.applyImpulseAtPoint(
        {
          x: radial.x * strength,
          y: GAME_TUNING.push.verticalHitImpulse,
          z: radial.z * strength,
        },
        { x: p.x, y: p.y + 0.58, z: p.z },
        true,
      );
      target.body.applyTorqueImpulse(
        {
          x: radial.z * (0.16 + impact * 0.18),
          y: slot.botOrbit * (0.08 + impact * 0.08),
          z: -radial.x * (0.16 + impact * 0.18),
        },
        true,
      );
      target.balance = clamp(
        target.balance -
          (GAME_TUNING.balance.hitLossBase +
            impact * GAME_TUNING.balance.hitLossScale),
        GAME_TUNING.balance.minimumAfterHit,
        1,
      );
      target.state = "hit";
      target.knockedUntil =
        now +
        GAME_TUNING.balance.knockdownBaseMs +
        impact * GAME_TUNING.balance.knockdownImpactMs;
      target.lastHitBy = slot.id;
      target.lastHitAt = now;
      this.applyKoDamage(
        target,
        GAME_TUNING.ko.heavyDamage * (0.65 + impact * 0.55),
        now,
        slot.id,
      );
      this.emitEvent("heavy_hit", now, slot.id, target.id, impact);
    }
  }

  private updateState(slot: Slot, now: number) {
    if (!slot.alive || slot.carriedBy) return;

    const p = slot.body.translation();
    const radius = Math.hypot(p.x, p.z);

    if (
      !slot.edgeHanging &&
      slot.state !== "climbing" &&
      p.y < -0.12 &&
      radius > TABLE_PUSH_GEOMETRY.arenaRadius - 0.5 &&
      radius < TABLE_PUSH_GEOMETRY.arenaRadius + 1.2
    ) {
      slot.edgeHanging = true;
      slot.edgeHangUntil = now + GAME_TUNING.ledge.hangWindowMs;
      slot.balance = Math.min(slot.balance, GAME_TUNING.ledge.hangBalanceCap);
      slot.state = "edge_hang";
      slot.body.setGravityScale(0, true);
      slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

      const outward = normalize(p.x, p.z);
      slot.body.setTranslation(
        { x: outward.x * (TABLE_PUSH_GEOMETRY.arenaRadius + 0.12), y: -0.35, z: outward.z * (TABLE_PUSH_GEOMETRY.arenaRadius + 0.12) },
        true,
      );
    }

    if (slot.edgeHanging) {
      const hp = slot.body.translation();
      const inward = normalize(-hp.x, -hp.z);
      const controllerDirection = normalize(slot.input.moveX, slot.input.moveY);
      const controllerPointsInward =
        controllerDirection.x * inward.x + controllerDirection.z * inward.z >
        GAME_TUNING.ledge.inwardInputDot;

      const inwardIntent = slot.bot
        ? now > slot.edgeHangUntil - GAME_TUNING.ledge.botRecoveryLeadMs
        : controllerPointsInward;

      if (inwardIntent) {
        slot.edgeHanging = false;
        slot.state = "climbing";
        slot.climbStartedAt = now;
        slot.climbUntil = now + GAME_TUNING.ledge.climbDurationMs;
        slot.climbFrom = { x: hp.x, y: hp.y, z: hp.z };
        slot.climbTo = {
          x: hp.x + inward.x * GAME_TUNING.ledge.climbInwardDistance,
          y: GAME_TUNING.ledge.climbTargetY,
          z: hp.z + inward.z * GAME_TUNING.ledge.climbInwardDistance,
        };
        slot.facingYaw = Math.atan2(inward.x, inward.z);
        slot.body.setGravityScale(0, true);
        slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.emitEvent("edge_save", now, slot.id, undefined, 0.8);
        return;
      }

      if (now >= slot.edgeHangUntil) {
        slot.body.setGravityScale(1, true);
        slot.edgeHanging = false;
        slot.balance = Math.min(slot.balance, GAME_TUNING.ledge.failedHangBalance);
        slot.state = "ragdoll";
        slot.knockedUntil = now + 420;
      }
    }

    if (p.y < -2.6) {
      if (slot.tossTargetId) {
        const carried = this.slots.find(
          (candidate) =>
            candidate.id === slot.tossTargetId &&
            candidate.carriedBy === slot.id,
        );
        if (carried) this.dropTossTarget(slot, carried, now);
        else this.clearToss(slot);
      }

      slot.alive = false;
      slot.state = "eliminated";
      slot.body.setEnabled(false);

      // 设计规则：掉出桌沿属于清积分死亡——本轮累计积分清零（击坠者仍得 1 分），
      // 决胜阶段之外可从场中心区域复活重新攒分。
      slot.score = 0;

      const permanentElimination = this.matchStage(now) === "final";
      slot.respawnAt = permanentElimination
        ? 0
        : now + GAME_TUNING.match.preFinalRespawnMs;

      let scorerId: string | undefined;
      if (slot.lastHitBy && now - slot.lastHitAt <= 4_000) {
        const scorer = this.slots.find((candidate) => candidate.id === slot.lastHitBy);
        if (scorer) {
          scorer.score += 1;
          scorerId = scorer.id;
        }
      }

      const living = this.slots.filter((candidate) => candidate.alive).length;
      const finalFall = permanentElimination && living <= 1;
      this.emitEvent(
        finalFall ? "final_elimination" : "big_fall",
        now,
        scorerId,
        slot.id,
        finalFall ? 1 : 0.75,
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
      matchStage: this.matchStage(now),
      countdownLeftMs: this.phase === "countdown"
        ? Math.max(0, this.countdownUntil - now)
        : undefined,
      winnerId: this.winnerId,
      events: this.pendingEvents.splice(0),
      arenaState: {
        centerSpinRadians: this.centerSpinRadians,
        centerSpinSpeed: this.currentLazySusanSpeed(now),
      },
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
          balance: slot.balance,
          stamina: clamp(
            slot.stamina / GAME_TUNING.stamina.max,
            0,
            1,
          ),
          koResistance: clamp(
            slot.koResistance / GAME_TUNING.ko.maxResistance,
            0,
            1,
          ),
          struggleProgress: clamp(
            slot.struggleProgress / GAME_TUNING.struggle.breakThreshold,
            0,
            1,
          ),
          sprinting: slot.sprinting,
          velocity: [v.x, v.y, v.z],
          score: slot.score,
          pushCooldownLeftMs: Math.max(0, slot.pushReadyAt - now),
          spawnProtectionLeftMs: Math.max(
            0,
            slot.invulnerableUntil - now,
          ),
          grabTargetId: slot.tossTargetId,
          state: slot.state,
          eliminated: !slot.alive,
          bot: slot.bot,
        };
      }),
    };

    this.io.emit("match:snapshot", snapshot);
  }
}

function botProfile(index: number) {
  const profiles = [
    {
      aggression: 0.98,
      edgeCaution: 1.12,
      orbitStrength: 0.08,
      edgeHunter: 0.55,
      pushRange: 1.5,
      pushFacing: 0.52,
      cooldownScale: 0.9,
      moveScale: 1.05,
    },
    {
      aggression: 0.68,
      edgeCaution: 1.72,
      orbitStrength: 0.34,
      edgeHunter: 0.12,
      pushRange: 1.34,
      pushFacing: 0.72,
      cooldownScale: 1.12,
      moveScale: 0.96,
    },
    {
      aggression: 0.84,
      edgeCaution: 1.4,
      orbitStrength: 0.18,
      edgeHunter: 1.05,
      pushRange: 1.48,
      pushFacing: 0.6,
      cooldownScale: 0.98,
      moveScale: 1,
    },
    {
      aggression: 0.74,
      edgeCaution: 1.34,
      orbitStrength: 0.52,
      edgeHunter: 0.4,
      pushRange: 1.4,
      pushFacing: 0.66,
      cooldownScale: 1.05,
      moveScale: 1.02,
    },
  ] as const;

  return profiles[index % profiles.length];
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

function positiveEnvMs(name: string) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x: number, z: number) {
  const length = Math.hypot(x, z);
  if (length < 0.0001) return { x: 0, z: 0 };
  return { x: x / length, z: z / length };
}

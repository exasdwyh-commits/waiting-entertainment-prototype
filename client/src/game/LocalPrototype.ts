import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { TABLE_PUSH_GEOMETRY } from "@waiting/shared";
import { ReplayBuffer } from "./ReplayBuffer";

type Actor = {
  id: string;
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  human: boolean;
  alive: boolean;
  color: number;
  pushReadyAt: number;
  knockedUntil: number;
  edgeHangUntil: number;
  edgeHanging: boolean;
};

type PrototypeOptions = {
  container: HTMLElement;
  timer: HTMLElement;
  message: HTMLElement;
};

const PLAYER_COUNT = 8;
const ROUND_MS = 180_000;
const MOVE_ACCEL = 0.16;
const MAX_SPEED = 4.2;
const SPRINT_MAX_SPEED = 5.55;
const SPRINT_ACCEL = 0.215;
const PUSH_RANGE = 1.65;
const PUSH_COOLDOWN = 850;

export class LocalPrototype {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly clock = new THREE.Clock();
  private readonly replay = new ReplayBuffer();

  private world!: RAPIER.World;
  private actors: Actor[] = [];
  private keys = new Set<string>();
  private pushQueued = false;
  private roundStartedAt = performance.now();
  private roundEnded = false;
  private restartAt = 0;
  private lastReplaySampleAt = 0;
  private animationFrame = 0;
  private lazySusan?: THREE.Group;
  private centerSpinRadians = 0;

  constructor(private readonly options: PrototypeOptions) {}

  async start() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });

    this.setupRenderer();
    this.setupScene();
    this.setupPhysics();
    this.bindControls();
    this.resetRound();

    this.clock.start();
    this.loop();
  }

  private setupRenderer() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.options.container.appendChild(this.renderer.domElement);

    const resize = () => {
      const { clientWidth, clientHeight } = this.options.container;
      this.renderer.setSize(clientWidth, clientHeight, false);
      this.camera.aspect = Math.max(0.1, clientWidth / Math.max(1, clientHeight));
      this.camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener("resize", resize);
  }

  private setupScene() {
    this.scene.background = new THREE.Color(0x111827);
    this.scene.fog = new THREE.Fog(0x111827, 15, 28);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 2.2);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(6, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_PUSH_GEOMETRY.arenaRadius, TABLE_PUSH_GEOMETRY.arenaRadius, 0.5, 64),
      new THREE.MeshStandardMaterial({ color: 0xf0b35b, roughness: 0.72, metalness: 0.02 }),
    );
    table.position.y = -0.25;
    table.receiveShadow = true;
    this.scene.add(table);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_PUSH_GEOMETRY.arenaRadius - 0.08, 0.08, 10, 96),
      new THREE.MeshStandardMaterial({ color: 0xffdf9b, emissive: 0x3a2200 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.04;
    this.scene.add(rim);

    const lazySusan = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(
        TABLE_PUSH_GEOMETRY.lazySusanRadius,
        TABLE_PUSH_GEOMETRY.lazySusanRadius,
        0.08,
        56,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xd8f0ee,
        roughness: 0.3,
        transparent: true,
        opacity: 0.6,
      }),
    );
    glass.position.y = 0.055;
    lazySusan.add(glass);
    this.lazySusan = lazySusan;
    this.scene.add(lazySusan);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 2.2, 3.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x6b3f25, roughness: 0.8 }),
    );
    pedestal.position.y = -2;
    this.scene.add(pedestal);

    this.camera.position.set(0, 13.4, 15.2);
    this.camera.lookAt(0, 0.2, 0);
  }

  private setupPhysics() {
    const tableBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.25, TABLE_PUSH_GEOMETRY.arenaRadius)
        .setFriction(1.25)
        .setRestitution(0.05),
      tableBody,
    );
  }

  private createActor(index: number): Actor {
    const palette = [0x38bdf8, 0xfb7185, 0xa78bfa, 0x4ade80, 0xfacc15, 0xf97316, 0x22d3ee, 0xe879f9];
    const color = palette[index % palette.length];
    const angle = (index / PLAYER_COUNT) * Math.PI * 2;
    const radius = index === 0 ? 0 : TABLE_PUSH_GEOMETRY.spawnRadius;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 1.05, z)
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

    const geometry = new THREE.CapsuleGeometry(0.36, 0.96, 6, 12);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    return {
      id: index === 0 ? "YOU" : `BOT-${index}`,
      mesh,
      body,
      human: index === 0,
      alive: true,
      color,
      pushReadyAt: 0,
      knockedUntil: 0,
      edgeHangUntil: 0,
      edgeHanging: false,
    };
  }

  private resetRound() {
    for (const actor of this.actors) {
      this.world.removeRigidBody(actor.body);
      this.scene.remove(actor.mesh);
      actor.mesh.geometry.dispose();
      (actor.mesh.material as THREE.Material).dispose();
    }

    this.actors = Array.from({ length: PLAYER_COUNT }, (_, index) => this.createActor(index));
    this.roundStartedAt = performance.now();
    this.centerSpinRadians = 0;
    if (this.lazySusan) this.lazySusan.rotation.y = 0;
    this.roundEnded = false;
    this.restartAt = 0;
    this.options.message.textContent = "3 · 2 · 1 · 推！";
    window.setTimeout(() => {
      if (!this.roundEnded) this.options.message.textContent = "";
    }, 950);
  }

  private bindControls() {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if (event.code === "Space") {
        event.preventDefault();
        this.pushQueued = true;
      }
      if (key === "r") this.resetRound();
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
  }

  private humanDirection() {
    const x = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0)
      - (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    const z = (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0)
      - (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0);

    return new THREE.Vector3(x, 0, z);
  }

  private botDirection(actor: Actor) {
    const p = actor.body.translation();
    const radial = new THREE.Vector3(p.x, 0, p.z);
    const edgeDistance = TABLE_PUSH_GEOMETRY.arenaRadius - radial.length();

    if (edgeDistance < 1.15) return radial.multiplyScalar(-1).normalize();

    let target: Actor | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of this.actors) {
      if (!candidate.alive || candidate === actor) continue;
      const c = candidate.body.translation();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < best) {
        best = d;
        target = candidate;
      }
    }

    if (!target) return new THREE.Vector3();
    const t = target.body.translation();
    return new THREE.Vector3(t.x - p.x, 0, t.z - p.z).normalize();
  }

  private drive(actor: Actor, direction: THREE.Vector3, now: number) {
    if (!actor.alive || actor.edgeHanging) return;
    if (now < actor.knockedUntil) return;
    if (direction.lengthSq() < 0.02) return;

    direction.normalize();
    const velocity = actor.body.linvel();
    const sprinting =
      actor.human &&
      (this.keys.has("shift") || this.keys.has("shiftleft")) &&
      direction.lengthSq() > 0.2;
    const accel = sprinting ? SPRINT_ACCEL : MOVE_ACCEL;
    const maxSpeed = sprinting ? SPRINT_MAX_SPEED : MAX_SPEED;

    actor.body.applyImpulse(
      { x: direction.x * accel, y: 0, z: direction.z * accel },
      true,
    );

    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (horizontalSpeed > maxSpeed) {
      const k = maxSpeed / horizontalSpeed;
      actor.body.setLinvel({ x: velocity.x * k, y: velocity.y, z: velocity.z * k }, true);
    }

    const yaw = Math.atan2(direction.x, direction.z);
    if (Math.abs(actor.body.angvel().x) < 2 && Math.abs(actor.body.angvel().z) < 2) {
      actor.mesh.userData.facingYaw = yaw;
    }
  }

  private push(actor: Actor, direction: THREE.Vector3, now: number) {
    if (!actor.alive || actor.edgeHanging || now < actor.pushReadyAt) return;
    if (direction.lengthSq() < 0.01) {
      const yaw = Number(actor.mesh.userData.facingYaw ?? 0);
      direction.set(Math.sin(yaw), 0, Math.cos(yaw));
    }

    direction.normalize();
    const preVelocity = actor.body.linvel();
    const preSpeed = Math.hypot(preVelocity.x, preVelocity.z);
    const momentumMultiplier = 0.85 + Math.min(1, preSpeed / MAX_SPEED) * 0.4;

    actor.pushReadyAt = now + PUSH_COOLDOWN;
    actor.body.applyImpulse({ x: direction.x * 1.7, y: 0.12, z: direction.z * 1.7 }, true);

    const origin = actor.body.translation();
    for (const target of this.actors) {
      if (!target.alive || target === actor) continue;
      const p = target.body.translation();
      const delta = new THREE.Vector3(p.x - origin.x, 0, p.z - origin.z);
      const distance = delta.length();
      if (distance > PUSH_RANGE || distance < 0.001) continue;

      const facing = direction.dot(delta.clone().normalize());
      if (facing < 0.15) continue;

      const strength = 2.8 * (1 - distance / (PUSH_RANGE * 1.4));
      const impulse = delta.normalize().multiplyScalar(strength);
      target.body.applyImpulseAtPoint(
        { x: impulse.x, y: 0.65, z: impulse.z },
        { x: p.x, y: p.y + 0.55, z: p.z },
        true,
      );
      target.knockedUntil = now + 650;
    }
  }

  private updateActorState(actor: Actor, now: number) {
    if (!actor.alive) return;
    const p = actor.body.translation();
    const radial = Math.hypot(p.x, p.z);

    if (!actor.edgeHanging && p.y < -0.15 && radial > TABLE_PUSH_GEOMETRY.arenaRadius - 0.55 && radial < TABLE_PUSH_GEOMETRY.arenaRadius + 1.2) {
      actor.edgeHanging = true;
      actor.edgeHangUntil = now + 1_400;
      actor.body.setGravityScale(0, true);
      actor.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      actor.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

      const inward = new THREE.Vector3(-p.x, 0, -p.z).normalize();
      actor.body.setTranslation(
        { x: -inward.x * (TABLE_PUSH_GEOMETRY.arenaRadius + 0.15), y: -0.35, z: -inward.z * (TABLE_PUSH_GEOMETRY.arenaRadius + 0.15) },
        true,
      );
    }

    if (actor.edgeHanging) {
      const humanWantsIn = actor.human && this.humanDirection().lengthSq() > 0.1;
      const botRecovers = !actor.human && now > actor.edgeHangUntil - 650;

      if (humanWantsIn || botRecovers) {
        const hp = actor.body.translation();
        const inward = new THREE.Vector3(-hp.x, 0, -hp.z).normalize();
        actor.body.setGravityScale(1, true);
        actor.body.setTranslation(
          { x: hp.x + inward.x * 1.25, y: 0.95, z: hp.z + inward.z * 1.25 },
          true,
        );
        actor.body.setLinvel({ x: inward.x * 1.4, y: 1.5, z: inward.z * 1.4 }, true);
        actor.edgeHanging = false;
        return;
      }

      if (now >= actor.edgeHangUntil) {
        actor.body.setGravityScale(1, true);
        actor.edgeHanging = false;
      }
    }

    if (p.y < -2.6) {
      actor.alive = false;
      actor.mesh.visible = false;
      actor.body.setEnabled(false);
      this.replay.mark({ type: "elimination", atMs: now, actorId: actor.id });

      if (actor.human) this.flash("你被推下去了！");
    }

    if (actor.alive && now > actor.knockedUntil) {
      const rotation = actor.body.rotation();
      const tilt = Math.abs(rotation.x) + Math.abs(rotation.z);
      const speed = actor.body.linvel();
      if (tilt > 0.35 && Math.hypot(speed.x, speed.z) < 1.5) {
        actor.body.setRotation({ x: 0, y: rotation.y, z: 0, w: Math.sqrt(Math.max(0, 1 - rotation.y * rotation.y)) }, true);
        actor.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  private updateLazySusan(now: number, delta: number) {
    if (this.roundEnded) return;

    const elapsed = Math.max(0, now - this.roundStartedAt);
    const progress = Math.max(0, Math.min(1, elapsed / ROUND_MS));
    let speed = 0.28 + (0.72 - 0.28) * progress;
    if (ROUND_MS - elapsed <= 15_000) speed *= 1.45;

    this.centerSpinRadians =
      (this.centerSpinRadians + speed * delta) % (Math.PI * 2);
    if (this.lazySusan) this.lazySusan.rotation.y = this.centerSpinRadians;

    const speedRatio = Math.min(1, speed / (0.72 * 1.45));
    for (const actor of this.actors) {
      if (!actor.alive || actor.edgeHanging) continue;

      const p = actor.body.translation();
      const radius = Math.hypot(p.x, p.z);
      if (radius <= 0.15 || radius > TABLE_PUSH_GEOMETRY.lazySusanRadius) continue;

      const radialRatio = Math.min(
        1,
        radius / TABLE_PUSH_GEOMETRY.lazySusanRadius,
      );
      const impulse =
        0.012 *
        (0.45 + speedRatio * 0.55) *
        radialRatio;

      actor.body.applyImpulse(
        {
          x: (-p.z / radius) * impulse,
          y: 0,
          z: (p.x / radius) * impulse,
        },
        true,
      );
    }
  }

  private sampleReplay(now: number) {
    if (now - this.lastReplaySampleAt < 100) return;
    this.lastReplaySampleAt = now;
    this.replay.push({
      atMs: now,
      actors: this.actors.map((actor) => {
        const p = actor.body.translation();
        const q = actor.body.rotation();
        return {
          id: actor.id,
          position: [p.x, p.y, p.z],
          rotation: [q.x, q.y, q.z, q.w],
          alive: actor.alive,
        };
      }),
    });
  }

  private updateMatch(now: number) {
    const remaining = Math.max(0, ROUND_MS - (now - this.roundStartedAt));
    const secondsLeft = Math.ceil(remaining / 1000);
    this.options.timer.textContent =
      `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

    if (this.roundEnded) {
      if (now >= this.restartAt) this.resetRound();
      return;
    }

    const alive = this.actors.filter((actor) => actor.alive);
    if (remaining <= 0 || alive.length <= 1) {
      this.roundEnded = true;
      this.restartAt = now + 3_000;
      const winner = alive[0];
      this.replay.mark({ type: "final", atMs: now, actorId: winner?.id });
      this.options.message.textContent = winner
        ? `🏆 ${winner.human ? "你赢了！" : winner.id + " 获胜"}`
        : "平局！";
    }
  }

  private flash(text: string) {
    this.options.message.textContent = text;
    window.setTimeout(() => {
      if (!this.roundEnded && this.options.message.textContent === text) {
        this.options.message.textContent = "";
      }
    }, 850);
  }

  private syncVisuals() {
    for (const actor of this.actors) {
      if (!actor.alive) continue;
      const p = actor.body.translation();
      const q = actor.body.rotation();
      actor.mesh.position.set(p.x, p.y, p.z);
      actor.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  private loop = () => {
    this.animationFrame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (!this.roundEnded) {
      for (const actor of this.actors) {
        if (!actor.alive) continue;

        const direction = actor.human ? this.humanDirection() : this.botDirection(actor);
        this.drive(actor, direction, now);

        if (actor.human && this.pushQueued) {
          this.push(actor, direction, now);
        }

        if (!actor.human) {
          const p = actor.body.translation();
          const nearest = this.actors
            .filter((candidate) => candidate !== actor && candidate.alive)
            .map((candidate) => {
              const c = candidate.body.translation();
              return Math.hypot(c.x - p.x, c.z - p.z);
            })
            .sort((a, b) => a - b)[0];

          if (nearest < 1.45 && now >= actor.pushReadyAt) this.push(actor, direction, now);
        }
      }
    }

    this.updateLazySusan(now, delta);

    this.pushQueued = false;
    this.world.timestep = Math.max(1 / 120, Math.min(1 / 30, delta || 1 / 60));
    this.world.step();

    for (const actor of this.actors) this.updateActorState(actor, now);
    this.syncVisuals();
    this.sampleReplay(now);
    this.updateMatch(now);
    this.renderer.render(this.scene, this.camera);
  };
}

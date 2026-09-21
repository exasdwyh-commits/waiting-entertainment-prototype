import * as THREE from "three";
import { TABLE_PUSH_GEOMETRY } from "@waiting/shared";
import type { MatchSnapshot, PlayerSnapshot, PlayerState } from "@waiting/shared";
import { createCharacterVisual, type CharacterVisual } from "./CharacterVisual";

type ActorView = {
  root: THREE.Group;
  visual?: CharacterVisual;
  ring: THREE.Mesh;
  targetPosition: THREE.Vector3;
  targetQuaternion: THREE.Quaternion;
  state: PlayerState;
  danger: number;
};

export class PersonalGameView {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 60);
  private readonly clock = new THREE.Clock();
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  private readonly actors = new Map<string, ActorView>();
  private readonly cameraPosition = new THREE.Vector3(0, 7.1, 6.2);
  private readonly cameraLook = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly inputForward = new THREE.Vector3();
  private readonly inputRight = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private ownPlayerId?: string;
  private snapshot?: MatchSnapshot;
  private animationFrame = 0;
  private fovKick = 0;
  private hitStopUntil = 0;
  private maxPixelRatio = 1.5;
  private minPixelRatio = 0.85;
  private currentPixelRatio = 1.5;
  private measuredFps = 60;
  private frameCounter = 0;
  private fpsWindowStartedAt = performance.now();
  private highFpsWindows = 0;
  private lastWidth = 1;
  private lastHeight = 1;

  constructor(private readonly container: HTMLElement) {
    const deviceRatio = Math.max(1, window.devicePixelRatio || 1);
    this.maxPixelRatio = Math.min(deviceRatio, 1.5);
    this.minPixelRatio = Math.min(this.maxPixelRatio, 0.85);
    this.currentPixelRatio = this.maxPixelRatio;
  }

  start() {
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x160f0c);
    this.scene.fog = new THREE.Fog(0x160f0c, 12, 28);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.8));

    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 9, 6);
    this.scene.add(key);

    const warm = new THREE.PointLight(0xffb45e, 4.2, 18, 2);
    warm.position.set(0, 5.5, 3.5);
    this.scene.add(warm);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(
        TABLE_PUSH_GEOMETRY.arenaRadius,
        TABLE_PUSH_GEOMETRY.arenaRadius,
        0.42,
        56,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xe7a94f,
        roughness: 0.82,
      }),
    );
    table.position.y = -0.22;
    this.scene.add(table);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(
        TABLE_PUSH_GEOMETRY.rimRadius,
        0.095,
        8,
        72,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xffe3a8,
        emissive: 0x3a2200,
      }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.035;
    this.scene.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 2.2, 3.5, 24),
      new THREE.MeshStandardMaterial({
        color: 0x6b3f25,
        roughness: 0.82,
      }),
    );
    pedestal.position.y = -2;
    this.scene.add(pedestal);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({
        color: 0x2b1c17,
        roughness: 0.94,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.68;
    this.scene.add(floor);

    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(TABLE_PUSH_GEOMETRY.arenaRadius + 2.55, 56),
      new THREE.MeshStandardMaterial({
        color: 0x461a17,
        roughness: 0.96,
      }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = -3.665;
    this.scene.add(rug);

    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(0, 0, 0);

    const resize = () => {
      const width = Math.max(1, this.container.clientWidth);
      const height = Math.max(1, this.container.clientHeight);
      this.lastWidth = width;
      this.lastHeight = height;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener("resize", resize);
    this.loop();
  }

  setOwnedPlayer(playerId: string) {
    this.ownPlayerId = playerId;
  }

  getPerformanceStats() {
    const quality =
      this.currentPixelRatio <= this.minPixelRatio + 0.04
        ? "low"
        : this.currentPixelRatio < this.maxPixelRatio - 0.08
          ? "balanced"
          : "high";

    return {
      fps: Math.round(this.measuredFps),
      pixelRatio: Number(this.currentPixelRatio.toFixed(2)),
      quality,
    };
  }

  private samplePerformance(now: number) {
    this.frameCounter += 1;
    const elapsed = now - this.fpsWindowStartedAt;
    if (elapsed < 2_000) return;

    const fps = (this.frameCounter * 1_000) / Math.max(1, elapsed);
    this.measuredFps = this.measuredFps * 0.45 + fps * 0.55;

    let nextRatio = this.currentPixelRatio;
    if (fps < 44 && this.currentPixelRatio > this.minPixelRatio + 0.02) {
      nextRatio = Math.max(this.minPixelRatio, this.currentPixelRatio - 0.15);
      this.highFpsWindows = 0;
    } else if (fps > 57 && this.currentPixelRatio < this.maxPixelRatio - 0.02) {
      this.highFpsWindows += 1;
      if (this.highFpsWindows >= 2) {
        nextRatio = Math.min(this.maxPixelRatio, this.currentPixelRatio + 0.1);
        this.highFpsWindows = 0;
      }
    } else {
      this.highFpsWindows = 0;
    }

    if (Math.abs(nextRatio - this.currentPixelRatio) >= 0.04) {
      this.currentPixelRatio = nextRatio;
      this.renderer.setPixelRatio(this.currentPixelRatio);
      this.renderer.setSize(this.lastWidth, this.lastHeight, false);
    }

    this.frameCounter = 0;
    this.fpsWindowStartedAt = now;
  }

  addImpact(strength = 0.5, received = false) {
    const normalized = Math.max(0.25, Math.min(1, strength));
    const amount = (received ? 3.2 : 1.8) * normalized;
    this.fovKick = Math.max(this.fovKick, amount);

    const hitStopMs = received
      ? 28 + normalized * 34
      : 18 + normalized * 22;
    this.hitStopUntil = Math.max(
      this.hitStopUntil,
      performance.now() + hitStopMs,
    );
  }

  toWorldInput(screenX: number, screenY: number) {
    this.camera.getWorldDirection(this.inputForward);
    this.inputForward.y = 0;

    if (this.inputForward.lengthSq() < 0.0001) {
      this.inputForward.set(0, 0, -1);
    } else {
      this.inputForward.normalize();
    }

    this.inputRight
      .crossVectors(this.inputForward, this.worldUp)
      .normalize();

    const forwardAmount = -screenY;
    const worldX =
      this.inputRight.x * screenX +
      this.inputForward.x * forwardAmount;
    const worldZ =
      this.inputRight.z * screenX +
      this.inputForward.z * forwardAmount;

    const magnitude = Math.hypot(worldX, worldZ);
    if (magnitude < 0.0001) return { x: 0, z: 0 };

    const scale = Math.min(1, Math.hypot(screenX, screenY)) / magnitude;
    return {
      x: worldX * scale,
      z: worldZ * scale,
    };
  }

  update(snapshot: MatchSnapshot) {
    this.snapshot = snapshot;

    for (const player of snapshot.players) {
      const actor = this.actors.get(player.id) ?? this.createActor(player);
      actor.targetPosition.set(...player.position);
      if (
        (player.state === "idle" ||
          player.state === "moving" ||
          player.state === "pushing" ||
          player.state === "grabbing" ||
          player.state === "throwing" ||
          player.state === "climbing" ||
          player.state === "celebrate") &&
        player.balance >= 0.68 &&
        isMostlyUpright(player.rotation)
      ) {
        actor.targetQuaternion.setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          player.facingYaw,
        );
      } else {
        actor.targetQuaternion.set(...player.rotation);
      }
      actor.state = player.state;
      const radius = Math.hypot(player.position[0], player.position[2]);
      actor.danger = THREE.MathUtils.clamp(
        (radius - TABLE_PUSH_GEOMETRY.dangerStartRadius) /
          Math.max(
            0.1,
            TABLE_PUSH_GEOMETRY.arenaRadius -
              TABLE_PUSH_GEOMETRY.dangerStartRadius,
          ),
        0,
        1,
      );
      actor.visual?.setState(player.state);

      const visible = !player.eliminated;
      actor.root.visible = visible;
      actor.ring.visible = visible && player.id === this.ownPlayerId;
    }
  }

  private createActor(player: PlayerSnapshot) {
    const index = Number(player.id.split("-")[1] ?? 0);
    const palette = [
      0x38bdf8,
      0xfb7185,
      0xa78bfa,
      0x4ade80,
      0xfacc15,
      0xf97316,
      0x22d3ee,
      0xe879f9,
    ];
    const tint = palette[index % palette.length];

    const root = new THREE.Group();
    root.position.set(...player.position);
    root.quaternion.set(...player.rotation);

    const placeholder = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.36, 0.96, 5, 8),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.62 }),
    );
    root.add(placeholder);
    this.scene.add(root);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.67, 32),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.scene.add(ring);

    const actor: ActorView = {
      root,
      ring,
      targetPosition: new THREE.Vector3(...player.position),
      targetQuaternion: new THREE.Quaternion(...player.rotation),
      state: player.state,
      danger: 0,
    };
    this.actors.set(player.id, actor);

    createCharacterVisual(tint, 1.7, index).then((visual) => {
      if (this.actors.get(player.id) !== actor) return;
      root.clear();
      root.add(visual.root);
      actor.visual = visual;
      visual.setState(actor.state);
    });

    return actor;
  }

  private updateCamera() {
    const ownId = this.ownPlayerId;
    const snapshot = this.snapshot;
    if (!ownId || !snapshot) return;

    const own = snapshot.players.find((player) => player.id === ownId);
    if (!own) return;

    const alive = snapshot.players.filter((player) => !player.eliminated);
    const fallbackSpectator = [...alive].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ar = Math.hypot(a.position[0], a.position[2]);
      const br = Math.hypot(b.position[0], b.position[2]);
      return ar - br;
    })[0];

    const winner = snapshot.winnerId
      ? snapshot.players.find((player) => player.id === snapshot.winnerId)
      : undefined;

    const subject =
      own.eliminated || snapshot.phase === "finished"
        ? winner ?? fallbackSpectator ?? own
        : own;

    const ownPosition = this.tmp.set(...subject.position);
    const edgeMoment = subject.state === "edge_hang" || subject.state === "climbing";
    const spectatorMode = subject.id !== own.id;
    const outward = new THREE.Vector3(ownPosition.x, 0, ownPosition.z);
    if (outward.lengthSq() > 0.001) outward.normalize();

    const desired = edgeMoment
      ? new THREE.Vector3(
          ownPosition.x + outward.x * 1.9,
          ownPosition.y + 4.7,
          ownPosition.z + outward.z * 1.9 + 3.4,
        )
      : new THREE.Vector3(
          ownPosition.x,
          ownPosition.y + (spectatorMode ? 7.1 : 6.3),
          ownPosition.z + (spectatorMode ? 6.3 : 5.2),
        );

    this.camera.position.lerp(
      desired,
      edgeMoment ? 0.18 : spectatorMode ? 0.09 : 0.12,
    );
    this.cameraLook.lerp(
      edgeMoment
        ? new THREE.Vector3(ownPosition.x, ownPosition.y + 0.2, ownPosition.z)
        : new THREE.Vector3(
            ownPosition.x,
            Math.max(0.3, ownPosition.y),
            ownPosition.z - 1.1,
          ),
      edgeMoment ? 0.24 : spectatorMode ? 0.13 : 0.18,
    );
    this.camera.lookAt(this.cameraLook);
  }

  private loop = () => {
    this.animationFrame = requestAnimationFrame(this.loop);

    const now = performance.now();
    this.samplePerformance(now);
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    const hitStopped = now < this.hitStopUntil;
    const delta = hitStopped ? 0 : rawDelta;

    for (const actor of this.actors.values()) {
      if (!hitStopped) {
        actor.root.position.lerp(actor.targetPosition, 0.32);
        actor.root.quaternion.slerp(actor.targetQuaternion, 0.38);
      }
      actor.visual?.update(delta);
      actor.ring.position.copy(actor.root.position);
      actor.ring.position.y = 0.04;

      const ringMaterial = actor.ring.material as THREE.MeshBasicMaterial;
      const urgent = actor.state === "edge_hang" || actor.state === "climbing";
      ringMaterial.color.setHex(
        urgent ? 0xf97316 : actor.danger > 0.55 ? 0xef4444 : 0xffffff,
      );
      ringMaterial.opacity = urgent
        ? 0.78 + Math.sin(now * 0.018) * 0.18
        : 0.72 + actor.danger * 0.24;
      const pulse = urgent
        ? 1.12 + Math.sin(now * 0.014) * 0.08
        : 1 + actor.danger * 0.15;
      actor.ring.scale.setScalar(pulse);
    }

    this.updateCamera();

    const targetFov = 56 + this.fovKick;
    const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.24);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.fovKick *= 0.8;
    if (this.fovKick < 0.02) this.fovKick = 0;

    this.renderer.render(this.scene, this.camera);
  };
}


function isMostlyUpright(rotation: [number, number, number, number]) {
  const [x, , z] = rotation;
  const upY = 1 - 2 * (x * x + z * z);
  return upY > 0.72;
}

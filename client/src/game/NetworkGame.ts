import * as THREE from "three";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import { TABLE_PUSH_GEOMETRY } from "@waiting/shared";
import type { GameEvent, MatchSnapshot, PlayerSnapshot, PlayerState } from "@waiting/shared";
import { createCharacterVisual, type CharacterVisual } from "./CharacterVisual";
import { ImpactFx } from "./ImpactFx";
import { AudioFx } from "./AudioFx";
import { addRestaurantEnvironment } from "./RestaurantEnvironment";
import { BroadcastDirector, type BroadcastShot } from "./BroadcastDirector";

type View = {
  root: THREE.Group;
  visual?: CharacterVisual;
  label: THREE.Sprite;
  ring: THREE.Mesh;
  targetPosition: THREE.Vector3;
  targetQuaternion: THREE.Quaternion;
  name: string;
  bot: boolean;
  joinPulseUntil: number;
  state: PlayerState;
};

type ReplayClip = {
  frames: MatchSnapshot[];
  label: string;
  loops: number;
  eventType?: GameEvent["type"];
  actorId?: string;
  targetId?: string;
};

type ReplayState = ReplayClip & {
  startedAt: number;
  loopsRemaining: number;
  reverseAngle: boolean;
};

type Options = {
  container: HTMLElement;
  timer: HTMLElement;
  message: HTMLElement;
  status: HTMLElement;
  qr: HTMLCanvasElement;
  joinText: HTMLElement;
  ranking: HTMLElement;
  broadcastBug: HTMLElement;
  directorMode: HTMLElement;
  directorLabel: HTMLElement;
  replayWipe: HTMLElement;
};

const REPLAY_SPEED = 0.45;
const REPLAY_LOOKBACK_MS = 1_300;
const REPLAY_LOOKAHEAD_MS = 550;
const HISTORY_MS = 65_000;
const MAX_HIGHLIGHTS = 3;

export class NetworkGame {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly clock = new THREE.Clock();
  private readonly views = new Map<string, View>();
  private readonly history: MatchSnapshot[] = [];
  private readonly fx = new ImpactFx(this.scene);
  private readonly audioFx = new AudioFx();
  private readonly director = new BroadcastDirector();
  private latest?: MatchSnapshot;
  private displaySnapshot?: MatchSnapshot;
  private replay?: ReplayState;
  private replayQueue: ReplayClip[] = [];
  private highlightEvents: GameEvent[] = [];
  private activeMatchId?: string;
  private replayedMatchId?: string;
  private animationFrame = 0;
  private cameraImpulse = 0;
  private cameraFovKick = 0;
  private hitStopUntil = 0;
  private readonly cameraLook = new THREE.Vector3();
  private lazySusan?: THREE.Group;
  private centerSpinRadians = 0;
  private centerSpinSpeed = 0;
  private lastDirectorShot?: BroadcastShot;

  constructor(private readonly options: Options) {}

  start() {
    this.setupRenderer();
    this.setupScene();
    this.setupJoinQR();
    this.connect();
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
    this.scene.background = new THREE.Color(0x160f0c);
    this.scene.fog = new THREE.Fog(0x160f0c, 18, 34);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));

    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(6, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(
        TABLE_PUSH_GEOMETRY.arenaRadius,
        TABLE_PUSH_GEOMETRY.arenaRadius,
        0.5,
        72,
      ),
      new THREE.MeshStandardMaterial({ color: 0xf0b35b, roughness: 0.72 }),
    );
    table.position.y = -0.25;
    table.receiveShadow = true;
    this.scene.add(table);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(
        TABLE_PUSH_GEOMETRY.rimRadius,
        0.1,
        10,
        112,
      ),
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
        64,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xd8f0ee,
        roughness: 0.26,
        metalness: 0.08,
        transparent: true,
        opacity: 0.62,
      }),
    );
    glass.position.y = 0.055;
    glass.receiveShadow = true;
    lazySusan.add(glass);

    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0xf6d9a7,
      emissive: 0x3b240d,
      roughness: 0.5,
    });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.035, 1.45),
        markerMaterial,
      );
      marker.position.set(
        Math.sin(angle) * TABLE_PUSH_GEOMETRY.lazySusanRadius * 0.58,
        0.11,
        Math.cos(angle) * TABLE_PUSH_GEOMETRY.lazySusanRadius * 0.58,
      );
      marker.rotation.y = angle;
      lazySusan.add(marker);
    }
    this.lazySusan = lazySusan;
    this.scene.add(lazySusan);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 2.2, 3.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x6b3f25, roughness: 0.8 }),
    );
    pedestal.position.y = -2;
    pedestal.castShadow = true;
    this.scene.add(pedestal);

    addRestaurantEnvironment(this.scene);

    this.camera.position.set(0, 13.4, 15.2);
    this.camera.lookAt(0, 0.2, 0);
  }

  private setupJoinQR() {
    const host = location.hostname;
    const joinUrl = `${location.protocol}//${host}:5174`;
    this.options.joinText.textContent = host === "localhost"
      ? "请用本机局域网 IP 打开大屏后扫码"
      : joinUrl;

    QRCode.toCanvas(this.options.qr, joinUrl, {
      width: 144,
      margin: 1,
      errorCorrectionLevel: "M",
    }).catch((error) => console.error("QR generation failed", error));
  }

  private connect() {
    const endpoint = `${location.protocol}//${location.hostname}:3001`;
    const socket = io(endpoint, { transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      this.options.status.textContent = "服务器已连接";
      this.options.status.classList.add("online");
    });

    socket.on("disconnect", () => {
      this.options.status.textContent = "服务器重连中";
      this.options.status.classList.remove("online");
    });

    socket.on("match:snapshot", (snapshot: MatchSnapshot) => {
      this.receive(snapshot);
    });

    socket.on("game:event", (event: GameEvent) => {
      this.director.noteEvent(event, performance.now());

      const impulse =
        event.type === "final_elimination" ? 0.52 :
        event.type === "big_fall" ? 0.32 :
        event.type === "toss" ? 0.3 + event.importance * 0.18 :
        event.type === "push_hit" ? 0.12 + event.importance * 0.16 :
        0.08;
      this.cameraImpulse = Math.max(this.cameraImpulse, impulse);
      const fovKick =
        event.type === "final_elimination" ? 6 :
        event.type === "big_fall" ? 4 :
        event.type === "toss" ? 3.5 + event.importance * 2.4 :
        event.type === "push_hit" ? 1.4 + event.importance * 2.2 :
        1.2;
      this.cameraFovKick = Math.max(this.cameraFovKick, fovKick);

      const hitStopMs =
        event.type === "final_elimination" ? 88 :
        event.type === "big_fall" ? 62 :
        event.type === "toss" ? 52 + event.importance * 36 :
        event.type === "push_hit" ? 22 + event.importance * 34 :
        event.type === "edge_save" ? 28 :
        0;
      this.hitStopUntil = Math.max(
        this.hitStopUntil,
        performance.now() + hitStopMs,
      );

      this.audioFx.play(event.type, event.importance);

      const subjectId = event.targetId ?? event.actorId;
      const subject = subjectId
        ? this.latest?.players.find((player) => player.id === subjectId)
        : undefined;

      if (subject) {
        this.fx.spawn(event.type, subject.position, event.importance);
      }
    });
  }

  private receive(snapshot: MatchSnapshot) {
    this.latest = snapshot;

    if (this.activeMatchId !== snapshot.matchId) {
      this.activeMatchId = snapshot.matchId;
      this.history.length = 0;
      this.highlightEvents = [];
      this.replayQueue = [];
      this.replay = undefined;
      this.replayedMatchId = undefined;
      this.director.reset();
      this.lastDirectorShot = undefined;
    }

    this.history.push(snapshot);

    for (const event of snapshot.events) {
      if (
        (
          event.type === "toss" ||
          event.type === "edge_save" ||
          event.type === "big_fall" ||
          event.type === "final_elimination"
        ) &&
        !this.highlightEvents.some((candidate) => candidate.id === event.id)
      ) {
        this.highlightEvents.push(event);
      }
    }

    const cutoff = snapshot.serverTimeMs - HISTORY_MS;
    while (this.history.length && this.history[0].serverTimeMs < cutoff) {
      this.history.shift();
    }

    if (
      snapshot.phase === "finished" &&
      this.replayedMatchId !== snapshot.matchId &&
      !this.replay
    ) {
      this.replayedMatchId = snapshot.matchId;
      this.replayQueue = this.buildHighlightQueue(snapshot);
      if (this.startNextReplay()) return;
    }

    if (!this.replay) this.applySnapshot(snapshot);
  }

  private buildHighlightQueue(snapshot: MatchSnapshot) {
    const eliminations = this.highlightEvents.filter(
      (event) => event.type === "big_fall" || event.type === "final_elimination",
    );

    const finalEvent = [...eliminations]
      .reverse()
      .find((event) => event.type === "final_elimination");

    const nonFinal = eliminations.filter(
      (event) => event.type === "big_fall" && event.id !== finalEvent?.id,
    );
    const previous = nonFinal[nonFinal.length - 1];

    const selected = finalEvent
      ? [previous, finalEvent]
          .filter((event): event is GameEvent => Boolean(event))
          .slice(-MAX_HIGHLIGHTS)
      : nonFinal.slice(-MAX_HIGHLIGHTS);

    return selected
      .map((event, index): ReplayClip | undefined => {
        const frames = this.history.filter(
          (frame) =>
            frame.matchId === snapshot.matchId &&
            frame.serverTimeMs >= event.atMs - REPLAY_LOOKBACK_MS &&
            frame.serverTimeMs <= event.atMs,
        );

        if (frames.length < 4) return undefined;

        const reference = frames[frames.length - 1];
        const actor = event.actorId
          ? reference.players.find((player) => player.id === event.actorId)
          : undefined;
        const target = event.targetId
          ? reference.players.find((player) => player.id === event.targetId)
          : undefined;

        const prefix =
          event.type === "final_elimination"
            ? "决胜击落"
            : selected.length > 1
              ? `精彩击落 ${index + 1}/${selected.length}`
              : "精彩击落";

        const label = actor && target
          ? `${prefix} · ${actor.name} → ${target.name}`
          : target
            ? `${prefix} · ${target.name} 出局`
            : prefix;

        return {
          frames,
          label,
          loops: event.type === "final_elimination" ? 2 : 1,
          actorId: event.actorId,
          targetId: event.targetId,
        };
      })
      .filter((clip): clip is ReplayClip => Boolean(clip));
  }

  private startNextReplay(now = performance.now()) {
    const clip = this.replayQueue.shift();
    if (!clip) return false;

    this.replay = {
      ...clip,
      startedAt: now,
      loopsRemaining: clip.loops,
      closeCamera: false,
    };
    return true;
  }

  private createView(player: PlayerSnapshot) {
    const index = Number(player.id.split("-")[1] ?? 0);
    const palette = [0x38bdf8, 0xfb7185, 0xa78bfa, 0x4ade80, 0xfacc15, 0xf97316, 0x22d3ee, 0xe879f9];
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

    const label = this.makeLabel(player.name, player.bot);
    this.scene.add(label);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.72, 40),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: player.bot ? 0.2 : 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(...player.position);
    ring.position.y = 0.045;
    ring.renderOrder = 4;
    this.scene.add(ring);

    const view: View = {
      root,
      label,
      ring,
      targetPosition: new THREE.Vector3(...player.position),
      targetQuaternion: new THREE.Quaternion(...player.rotation),
      name: player.name,
      bot: player.bot,
      joinPulseUntil: player.bot ? 0 : performance.now() + 900,
      state: player.state,
    };

    this.views.set(player.id, view);

    createCharacterVisual(tint, 1.7, index).then((visual) => {
      if (this.views.get(player.id) !== view) return;
      root.clear();
      root.add(visual.root);
      view.visual = visual;
      visual.setState(view.state);
    });

    return view;
  }

  private makeLabel(name: string, bot: boolean) {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(8,12,20,.72)";
    ctx.roundRect(4, 8, 312, 64, 28);
    ctx.fill();
    ctx.font = "700 30px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(bot ? `${name} · AI` : name, 160, 40);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.35, 0.59, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private refreshLabel(view: View, player: PlayerSnapshot) {
    if (view.name === player.name && view.bot === player.bot) return;

    const becameHuman = view.bot && !player.bot;

    this.scene.remove(view.label);
    (view.label.material as THREE.SpriteMaterial).map?.dispose();
    (view.label.material as THREE.Material).dispose();
    view.label = this.makeLabel(player.name, player.bot);
    view.label.userData.bot = player.bot;
    view.name = player.name;
    view.bot = player.bot;

    if (becameHuman) {
      view.joinPulseUntil = performance.now() + 1_200;
    }

    this.scene.add(view.label);
  }

  private applySnapshot(snapshot: MatchSnapshot) {
    this.displaySnapshot = snapshot;
    if (snapshot.arenaState) {
      this.centerSpinRadians = snapshot.arenaState.centerSpinRadians;
      this.centerSpinSpeed = snapshot.arenaState.centerSpinSpeed;
    }
    const humanCount = snapshot.players.filter((player) => !player.bot).length;
    this.options.status.textContent = `真人 ${humanCount}/${snapshot.players.length} · AI ${snapshot.players.length - humanCount}`;
    this.options.timer.textContent = String(Math.ceil(snapshot.timeLeftMs / 1000));
    this.options.timer.classList.toggle(
      "danger",
      snapshot.phase === "playing" && snapshot.timeLeftMs <= 10_000,
    );
    this.renderRanking(snapshot);

    for (const player of snapshot.players) {
      const view = this.views.get(player.id) ?? this.createView(player);
      this.refreshLabel(view, player);
      view.targetPosition.set(...player.position);
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
        view.targetQuaternion.setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          player.facingYaw,
        );
      } else {
        view.targetQuaternion.set(...player.rotation);
      }
      view.state = player.state;
      view.visual?.setState(player.state);
      view.root.visible = !player.eliminated;
      view.label.visible = !player.eliminated;
      view.ring.visible = !player.eliminated;
    }

    if (!this.replay && snapshot.phase === "countdown") {
      const count = Math.max(1, Math.ceil((snapshot.countdownLeftMs ?? 0) / 1000));
      this.options.message.textContent = String(count);
    } else if (!this.replay && snapshot.phase === "finished") {
      const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
      this.options.message.textContent = winner ? `🏆 ${winner.name} 获胜` : "本局结束";
    } else if (!this.replay && snapshot.phase === "playing") {
      const edgePlayer = snapshot.players.find(
        (player) => player.state === "edge_hang" || player.state === "climbing",
      );
      this.options.message.textContent =
        edgePlayer?.state === "edge_hang"
          ? `⚠ ${edgePlayer.name} 抓住桌沿！`
          : edgePlayer?.state === "climbing"
            ? `↥ ${edgePlayer.name} 正在爬回来！`
            : "";
    }
  }

  private renderRanking(snapshot: MatchSnapshot) {
    const ranked = [...snapshot.players].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      const ar = Math.hypot(a.position[0], a.position[2]);
      const br = Math.hypot(b.position[0], b.position[2]);
      return ar - br;
    });

    this.options.ranking.replaceChildren();
    for (const [index, player] of ranked.entries()) {
      const item = document.createElement("li");
      item.className = player.eliminated ? "eliminated" : "";
      const rank = document.createElement("b");
      rank.textContent = String(index + 1);
      const name = document.createElement("span");
      name.textContent = player.bot ? `${player.name} · AI` : player.name;
      const score = document.createElement("em");
      score.textContent = `+${player.score}`;
      item.append(rank, name, score);
      this.options.ranking.append(item);
    }
  }

  private updateReplay(now: number) {
    const replay = this.replay;
    if (!replay || replay.frames.length < 2) return;

    const first = replay.frames[0].serverTimeMs;
    const last = replay.frames[replay.frames.length - 1].serverTimeMs;
    const sourceDuration = Math.max(1, last - first);
    const replayDuration = sourceDuration / REPLAY_SPEED;
    const elapsed = now - replay.startedAt;

    if (elapsed >= replayDuration) {
      if (replay.loopsRemaining > 1) {
        replay.loopsRemaining -= 1;
        replay.startedAt = now;
        replay.closeCamera = true;
        return;
      }

      this.replay = undefined;
      if (this.startNextReplay(now)) return;

      this.options.message.textContent = "";
      if (this.latest) this.applySnapshot(this.latest);
      return;
    }

    const sourceTime = first + elapsed * REPLAY_SPEED;
    let frame = replay.frames[0];
    for (const candidate of replay.frames) {
      if (candidate.serverTimeMs > sourceTime) break;
      frame = candidate;
    }

    this.options.message.textContent = replay.closeCamera
      ? `🎥 ${replay.label} · 近景`
      : `🎥 ${replay.label} ×0.45`;
    this.applySnapshot(frame);
  }

  private loop = () => {
    this.animationFrame = requestAnimationFrame(this.loop);
    const now = performance.now();

    if (this.replay) this.updateReplay(now);
    this.fx.update(now);

    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    if (this.lazySusan) {
      this.centerSpinRadians += this.centerSpinSpeed * rawDelta;
      this.lazySusan.rotation.y = this.centerSpinRadians;
    }
    const hitStopped = !this.replay && now < this.hitStopUntil;
    const delta = hitStopped ? 0 : rawDelta;

    for (const view of this.views.values()) {
      if (!hitStopped) {
        view.root.position.lerp(view.targetPosition, this.replay ? 0.42 : 0.28);
        view.root.quaternion.slerp(view.targetQuaternion, this.replay ? 0.5 : 0.32);
      }
      view.visual?.update(delta);
      view.label.position.copy(view.root.position).add(new THREE.Vector3(0, 1.65, 0));
      view.ring.position.copy(view.root.position);
      view.ring.position.y = 0.045;

      const ringMaterial = view.ring.material as THREE.MeshBasicMaterial;
      const joining = now < view.joinPulseUntil;
      const pulse = joining
        ? 1.12 + Math.sin(now * 0.024) * 0.16
        : view.bot
          ? 0.82
          : 1 + Math.sin(now * 0.008) * 0.035;

      view.ring.scale.setScalar(pulse);
      ringMaterial.opacity = joining
        ? 0.96
        : view.bot
          ? 0.16
          : 0.78;
    }

    const cameraSnapshot = this.displaySnapshot ?? this.latest;
    const allAlive = cameraSnapshot?.players.filter((player) => !player.eliminated) ?? [];
    const replayFocusIds = this.replay
      ? new Set<string>(
          [this.replay.actorId, this.replay.targetId].filter(
            (id): id is string => Boolean(id),
          ),
        )
      : undefined;
    const focused = replayFocusIds?.size
      ? allAlive.filter((player) => replayFocusIds.has(player.id))
      : [];
    const alive = focused.length ? focused : allAlive;
    let centerX = 0;
    let centerZ = 0;

    if (alive.length) {
      centerX = alive.reduce((sum, player) => sum + player.position[0], 0) / alive.length;
      centerZ = alive.reduce((sum, player) => sum + player.position[2], 0) / alive.length;
    }

    let spread = 4;
    for (const player of alive) {
      spread = Math.max(
        spread,
        Math.hypot(player.position[0] - centerX, player.position[2] - centerZ),
      );
    }

    const hanging = alive.find(
      (player) => player.state === "edge_hang" || player.state === "climbing",
    );
    if (hanging && !this.replay) {
      centerX = centerX * 0.55 + hanging.position[0] * 0.45;
      centerZ = centerZ * 0.55 + hanging.position[2] * 0.45;
    }

    const tension = !this.replay &&
      cameraSnapshot?.phase === "playing" &&
      (cameraSnapshot?.timeLeftMs ?? 60_000) <= 10_000;

    const cameraTarget = this.replay?.closeCamera
      ? new THREE.Vector3(centerX, 9.2, centerZ + 10.6)
      : new THREE.Vector3(
          centerX,
          10.8 + spread * 0.42 - (tension ? 0.75 : 0),
          centerZ + 11.8 + spread * 0.46 - (tension ? 0.95 : 0),
        );

    this.camera.position.lerp(cameraTarget, this.replay ? 0.075 : 0.045);
    this.cameraLook.lerp(
      new THREE.Vector3(centerX, hanging ? -0.1 : 0.15, centerZ),
      hanging ? 0.11 : 0.07,
    );

    if (this.cameraImpulse > 0.002) {
      const shake = this.cameraImpulse;
      this.camera.position.x += Math.sin(now * 0.091) * shake;
      this.camera.position.y += Math.cos(now * 0.077) * shake * 0.55;
      this.cameraImpulse *= 0.86;
    } else {
      this.cameraImpulse = 0;
    }

    const targetFov = 50 + this.cameraFovKick;
    const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.22);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.cameraFovKick *= 0.82;
    if (this.cameraFovKick < 0.02) this.cameraFovKick = 0;

    this.camera.lookAt(this.cameraLook);
    this.renderer.render(this.scene, this.camera);
  };
}


function isMostlyUpright(rotation: [number, number, number, number]) {
  const [x, , z] = rotation;
  const upY = 1 - 2 * (x * x + z * z);
  return upY > 0.72;
}

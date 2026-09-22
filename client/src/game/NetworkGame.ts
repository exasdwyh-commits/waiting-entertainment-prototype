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
  spawnProtected: boolean;
  tint: number;
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

const REPLAY_SPEED = 0.5;
const REPLAY_LOOKBACK_MS = 750;
const REPLAY_LOOKAHEAD_MS = 250;
const HISTORY_MS = 65_000;
const MAX_HIGHLIGHTS = 2;
const MAX_REPLAY_PACKAGE_MS = 6_200;
const MIN_REPLAY_PASS_MS = 1_400;
const MAX_REPLAY_PASS_MS = 1_900;

function replayPassDuration(sourceMs: number) {
  return Math.min(
    MAX_REPLAY_PASS_MS,
    Math.max(MIN_REPLAY_PASS_MS, sourceMs / REPLAY_SPEED),
  );
}

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
        event.type === "heavy_hit" ? 0.22 + event.importance * 0.18 :
        event.type === "punch_hit" || event.type === "push_hit"
          ? 0.08 + event.importance * 0.1 :
        event.type === "grab" ? 0.035 :
        0.08;
      this.cameraImpulse = Math.max(this.cameraImpulse, impulse);
      const fovKick =
        event.type === "final_elimination" ? 6 :
        event.type === "big_fall" ? 4 :
        event.type === "toss" ? 3.5 + event.importance * 2.4 :
        event.type === "heavy_hit" ? 3 + event.importance * 2.6 :
        event.type === "punch_hit" || event.type === "push_hit"
          ? 0.8 + event.importance * 1.4 :
        event.type === "grab" ? 0.35 :
        1.2;
      this.cameraFovKick = Math.max(this.cameraFovKick, fovKick);

      const hitStopMs =
        event.type === "final_elimination" ? 88 :
        event.type === "big_fall" ? 62 :
        event.type === "toss" ? 52 + event.importance * 36 :
        event.type === "heavy_hit" ? 42 + event.importance * 34 :
        event.type === "punch_hit" || event.type === "push_hit"
          ? 14 + event.importance * 18 :
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

      const targetView = event.targetId
        ? this.views.get(event.targetId)
        : undefined;
      const actorView = event.actorId
        ? this.views.get(event.actorId)
        : undefined;

      if (
        event.type === "punch_hit" ||
        event.type === "push_hit" ||
        event.type === "heavy_hit" ||
        event.type === "toss"
      ) {
        targetView?.visual?.addImpact(
          event.type === "heavy_hit" || event.type === "toss"
            ? Math.max(0.85, event.importance)
            : event.importance,
          true,
        );
        actorView?.visual?.addImpact(
          event.type === "heavy_hit" ? 0.72 : 0.38,
          false,
        );
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
      this.options.message.classList.remove("replay-caption");
      this.options.message.textContent = "";
      this.options.replayWipe.classList.remove("active");
      this.updateBroadcastBug("比赛准备", false);
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
    const finalEvent = [...this.highlightEvents]
      .reverse()
      .find((event) => event.type === "final_elimination");

    const scored = this.highlightEvents
      .filter((event) => event.id !== finalEvent?.id)
      .map((event) => ({
        event,
        score:
          event.type === "big_fall"
            ? 70 + event.importance * 20
            : event.type === "toss"
              ? 62 + event.importance * 22
              : event.type === "edge_save"
                ? 56 + event.importance * 18
                : 0,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.event.atMs - a.event.atMs)
      .slice(0, Math.max(0, MAX_HIGHLIGHTS - (finalEvent ? 1 : 0)))
      .map((entry) => entry.event);

    const selected = [...scored, ...(finalEvent ? [finalEvent] : [])]
      .sort((a, b) => a.atMs - b.atMs)
      .slice(-MAX_HIGHLIGHTS);

    const candidates = selected
      .map((event, index): ReplayClip | undefined => {
        const frames = this.history.filter(
          (frame) =>
            frame.matchId === snapshot.matchId &&
            frame.serverTimeMs >= event.atMs - REPLAY_LOOKBACK_MS &&
            frame.serverTimeMs <= event.atMs + REPLAY_LOOKAHEAD_MS,
        );

        if (frames.length < 4) return undefined;

        const reference =
          [...frames]
            .reverse()
            .find((frame) => frame.serverTimeMs <= event.atMs) ??
          frames[frames.length - 1];
        const actor = event.actorId
          ? reference.players.find((player) => player.id === event.actorId)
          : undefined;
        const target = event.targetId
          ? reference.players.find((player) => player.id === event.targetId)
          : undefined;

        const prefix =
          event.type === "final_elimination"
            ? "决胜击落"
            : event.type === "big_fall"
              ? "精彩击落"
              : event.type === "toss"
                ? "暴力甩飞"
                : "极限救边";

        const numberedPrefix =
          selected.length > 1 && event.type !== "final_elimination"
            ? `${prefix} ${index + 1}/${selected.length}`
            : prefix;

        const label =
          actor && target
            ? `${numberedPrefix} · ${actor.name} → ${target.name}`
            : target
              ? `${numberedPrefix} · ${target.name}`
              : actor
                ? `${numberedPrefix} · ${actor.name}`
                : numberedPrefix;

        return {
          frames,
          label,
          loops:
            event.type === "final_elimination" ||
            (event.type === "toss" && event.importance >= 0.96)
              ? 2
              : 1,
          eventType: event.type,
          actorId: event.actorId,
          targetId: event.targetId,
        };
      })
      .filter((clip): clip is ReplayClip => Boolean(clip));

    if (candidates.length) {
      const budgeted: ReplayClip[] = [];
      let usedMs = 0;

      // The decisive clip is added first so a secondary highlight can never
      // consume the result-window budget needed for the final replay.
      const ordered = [...candidates].sort((a, b) => {
        const aFinal = a.eventType === "final_elimination" ? 1 : 0;
        const bFinal = b.eventType === "final_elimination" ? 1 : 0;
        return bFinal - aFinal;
      });

      for (const clip of ordered) {
        const first = clip.frames[0]?.serverTimeMs ?? 0;
        const last =
          clip.frames[clip.frames.length - 1]?.serverTimeMs ?? first;
        const sourceMs = Math.max(1, last - first);
        let loops = clip.loops;
        const passMs = replayPassDuration(sourceMs);
        let playbackMs = passMs * loops;

        if (usedMs + playbackMs > MAX_REPLAY_PACKAGE_MS && loops > 1) {
          loops = 1;
          playbackMs = passMs;
        }
        if (usedMs + playbackMs > MAX_REPLAY_PACKAGE_MS) continue;

        budgeted.push({ ...clip, loops });
        usedMs += playbackMs;
      }

      // Restore chronological order for the actual show package.
      budgeted.sort(
        (a, b) =>
          (a.frames[0]?.serverTimeMs ?? 0) -
          (b.frames[0]?.serverTimeMs ?? 0),
      );

      if (budgeted.length) return budgeted;
    }

    const fallbackFrames = this.history.filter(
      (frame) =>
        frame.matchId === snapshot.matchId &&
        frame.serverTimeMs >= snapshot.serverTimeMs - 1_600,
    );

    if (fallbackFrames.length < 4) return [];

    const winner = snapshot.winnerId
      ? snapshot.players.find((player) => player.id === snapshot.winnerId)
      : undefined;

    return [
      {
        frames: fallbackFrames,
        label: winner ? `终场回放 · ${winner.name}` : "终场回放",
        loops: 1,
        actorId: winner?.id,
      },
    ];
  }

  previewReplay(): boolean {
    const latest = this.latest;
    if (!latest || this.history.length < 4 || this.replay) return false;

    const sameMatch = this.history.filter(
      (frame) => frame.matchId === latest.matchId,
    );
    const frames = sameMatch.slice(-Math.min(24, sameMatch.length));
    if (frames.length < 4) return false;

    const actor = frames[frames.length - 1]?.players[0];
    const target = frames[frames.length - 1]?.players[1];
    this.replayQueue = [{
      frames,
      label: actor && target
        ? `视觉回放验收 · ${actor.name} → ${target.name} · 反打机位`
        : "视觉回放验收 · 反打机位",
      loops: 1,
      actorId: actor?.id,
      targetId: target?.id,
    }];
    return this.startNextReplay();
  }

  private startNextReplay(now = performance.now()) {
    const clip = this.replayQueue.shift();
    if (!clip) return false;

    this.replay = {
      ...clip,
      startedAt: now,
      loopsRemaining: clip.loops,
      reverseAngle: false,
    };
    this.triggerReplayWipe();
    return true;
  }

  private triggerReplayWipe() {
    this.options.replayWipe.classList.remove("active");
    void this.options.replayWipe.offsetWidth;
    this.options.replayWipe.classList.add("active");
  }

  private updateBroadcastBug(label: string, replay: boolean) {
    this.options.broadcastBug.dataset.mode = replay ? "replay" : "live";
    this.options.directorMode.textContent = replay ? "REPLAY" : "LIVE";
    this.options.directorLabel.textContent = label;
  }

  private createView(player: PlayerSnapshot) {
    const index = Number(player.id.split("-")[1] ?? 0);
    const palette = [ 0x38bdf8, 0xfb7185, 0xa78bfa, 0x4ade80, 0xfacc15, 0xf97316, 0x22d3ee, 0xe879f9, 0xf43f5e, 0x84cc16, ];
    const tint = palette[index % palette.length];

    const root = new THREE.Group();
    root.position.set(...player.position);
    if (usesFacingYaw(player.state)) {
      root.quaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        player.facingYaw,
      );
    } else {
      root.quaternion.set(...player.rotation);
    }

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
      targetQuaternion: usesFacingYaw(player.state)
        ? new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            player.facingYaw,
          )
        : new THREE.Quaternion(...player.rotation),
      name: player.name,
      bot: player.bot,
      joinPulseUntil: player.bot ? 0 : performance.now() + 900,
      spawnProtected: player.spawnProtectionLeftMs > 0,
      tint,
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
    const stageText = {
      opening: "开局混战",
      brawl: "高密度乱斗",
      danger: "危险升级",
      final: "FINAL CHAOS",
    }[snapshot.matchStage];
    this.options.status.textContent =
      `${stageText} · 真人 ${humanCount}/${snapshot.players.length} · AI ${snapshot.players.length - humanCount}`;

    const totalSeconds = Math.max(0, Math.ceil(snapshot.timeLeftMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    this.options.timer.textContent = `${minutes}:${seconds}`;
    this.options.timer.classList.toggle(
      "danger",
      snapshot.phase === "playing" && snapshot.matchStage === "final",
    );
    this.renderRanking(snapshot);

    for (const player of snapshot.players) {
      const view = this.views.get(player.id) ?? this.createView(player);
      this.refreshLabel(view, player);
      view.targetPosition.set(...player.position);
      if (usesFacingYaw(player.state)) {
        view.targetQuaternion.setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          player.facingYaw,
        );
      } else {
        view.targetQuaternion.set(...player.rotation);
      }
      view.state = player.state;
      view.spawnProtected = player.spawnProtectionLeftMs > 0;
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
    const replayDuration = replayPassDuration(sourceDuration);
    const elapsed = now - replay.startedAt;

    if (elapsed >= replayDuration) {
      if (replay.loopsRemaining > 1) {
        replay.loopsRemaining -= 1;
        replay.startedAt = now;
        replay.reverseAngle = true;
        this.triggerReplayWipe();
        return;
      }

      this.replay = undefined;
      this.options.message.classList.remove("replay-caption");
      this.options.message.textContent = "";

      if (this.startNextReplay(now)) return;

      if (this.latest) this.applySnapshot(this.latest);
      return;
    }

    const sourceProgress = Math.min(1, elapsed / replayDuration);
    const sourceTime = first + sourceDuration * sourceProgress;
    let frame = replay.frames[0];
    for (const candidate of replay.frames) {
      if (candidate.serverTimeMs > sourceTime) break;
      frame = candidate;
    }

    this.options.message.classList.add("replay-caption");
    this.options.message.textContent = replay.reverseAngle
      ? `${replay.label} · 反打机位`
      : `${replay.label} · ${REPLAY_SPEED.toFixed(2)}×`;
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
      const protectedSpawn = view.spawnProtected;
      const pulse = protectedSpawn
        ? 1.08 + Math.sin(now * 0.02) * 0.13
        : joining
          ? 1.12 + Math.sin(now * 0.024) * 0.16
          : view.bot
            ? 0.82
            : 1 + Math.sin(now * 0.008) * 0.035;

      view.ring.scale.setScalar(pulse);
      ringMaterial.color.setHex(protectedSpawn ? 0x67e8f9 : view.tint);
      ringMaterial.opacity = protectedSpawn
        ? 0.88
        : joining
          ? 0.96
          : view.bot
            ? 0.16
            : 0.78;
    }

    const cameraSnapshot = this.displaySnapshot ?? this.latest;
    const decision = this.director.decide(
      cameraSnapshot,
      now,
      this.replay
        ? {
            actorId: this.replay.actorId,
            targetId: this.replay.targetId,
            reverseAngle: this.replay.reverseAngle,
            label: this.replay.label,
          }
        : undefined,
    );
    this.updateBroadcastBug(decision.label, decision.replay);

    const allAlive =
      cameraSnapshot?.players.filter((player) => !player.eliminated) ?? [];
    const focusIds = new Set(decision.focusIds);
    const focused = focusIds.size
      ? allAlive.filter((player) => focusIds.has(player.id))
      : [];
    const subjects = focused.length ? focused : allAlive;

    let centerX = 0;
    let centerZ = 0;
    if (subjects.length) {
      centerX =
        subjects.reduce((sum, player) => sum + player.position[0], 0) /
        subjects.length;
      centerZ =
        subjects.reduce((sum, player) => sum + player.position[2], 0) /
        subjects.length;
    }

    let spread = decision.shot === "master" ? 4 : 1.8;
    for (const player of subjects) {
      spread = Math.max(
        spread,
        Math.hypot(
          player.position[0] - centerX,
          player.position[2] - centerZ,
        ),
      );
    }

    const primary = focused[0];
    const secondary = focused[1];
    let axisX = 0;
    let axisZ = 1;
    if (primary && secondary) {
      const dx = secondary.position[0] - primary.position[0];
      const dz = secondary.position[2] - primary.position[2];
      const length = Math.hypot(dx, dz);
      if (length > 0.001) {
        axisX = dx / length;
        axisZ = dz / length;
      }
    } else if (Math.hypot(centerX, centerZ) > 0.001) {
      const length = Math.hypot(centerX, centerZ);
      axisX = centerX / length;
      axisZ = centerZ / length;
    }

    const sideSign = decision.shot === "replay-reverse" ? -1 : 1;
    const sideX = -axisZ * sideSign;
    const sideZ = axisX * sideSign;
    const tension =
      !this.replay &&
      cameraSnapshot?.phase === "playing" &&
      (cameraSnapshot?.timeLeftMs ?? 60_000) <= 10_000;

    let lookY = 0.15;
    let cameraTarget: THREE.Vector3;

    if (decision.shot === "impact") {
      cameraTarget = new THREE.Vector3(
        centerX + sideX * (5.8 + spread * 0.25) - axisX * 1.1,
        5.8 + spread * 0.28,
        centerZ + sideZ * (5.8 + spread * 0.25) - axisZ * 1.1,
      );
      lookY = 0.42;
    } else if (decision.shot === "edge") {
      const radialLength = Math.max(0.001, Math.hypot(centerX, centerZ));
      const outwardX = centerX / radialLength;
      const outwardZ = centerZ / radialLength;
      cameraTarget = new THREE.Vector3(
        centerX + outwardX * 4.8 + sideX * 1.25,
        4.6,
        centerZ + outwardZ * 4.8 + sideZ * 1.25,
      );
      lookY = -0.12;
    } else if (decision.shot === "duel") {
      const orbit = now * 0.00018;
      const distance = 8.2 + spread * 0.65;
      cameraTarget = new THREE.Vector3(
        centerX + Math.sin(orbit) * distance,
        6.4 + spread * 0.18,
        centerZ + Math.cos(orbit) * distance,
      );
      lookY = 0.35;
    } else if (decision.shot === "winner") {
      const orbit = now * 0.00032;
      cameraTarget = new THREE.Vector3(
        centerX + Math.sin(orbit) * 5.4,
        4.2,
        centerZ + Math.cos(orbit) * 5.4,
      );
      lookY = 0.62;
    } else if (
      decision.shot === "replay-master" ||
      decision.shot === "replay-reverse"
    ) {
      const distance =
        decision.shot === "replay-reverse" ? 4.9 : 6.4;
      cameraTarget = new THREE.Vector3(
        centerX + sideX * distance - axisX * 1.35,
        decision.shot === "replay-reverse" ? 4.25 : 5.55,
        centerZ + sideZ * distance - axisZ * 1.35,
      );
      lookY = 0.38;
    } else {
      cameraTarget = new THREE.Vector3(
        centerX,
        10.8 + spread * 0.42 - (tension ? 0.75 : 0),
        centerZ + 11.8 + spread * 0.46 - (tension ? 0.95 : 0),
      );
    }

    const shotChanged = this.lastDirectorShot !== decision.shot;
    if (shotChanged && decision.replay) {
      this.camera.position.copy(cameraTarget);
      this.cameraLook.set(centerX, lookY, centerZ);
    } else {
      const cameraLerp =
        decision.shot === "impact" || decision.shot === "edge"
          ? 0.14
          : decision.shot === "winner"
            ? 0.09
            : decision.shot === "duel"
              ? 0.065
              : 0.045;
      this.camera.position.lerp(
        cameraTarget,
        shotChanged ? Math.max(cameraLerp, 0.42) : cameraLerp,
      );
      this.cameraLook.lerp(
        new THREE.Vector3(centerX, lookY, centerZ),
        shotChanged ? 0.42 : decision.shot === "master" ? 0.07 : 0.13,
      );
    }
    this.lastDirectorShot = decision.shot;

    if (this.cameraImpulse > 0.002) {
      const shake = this.cameraImpulse;
      this.camera.position.x += Math.sin(now * 0.091) * shake;
      this.camera.position.y += Math.cos(now * 0.077) * shake * 0.55;
      this.cameraImpulse *= 0.86;
    } else {
      this.cameraImpulse = 0;
    }

    const baseFov =
      decision.shot === "winner"
        ? 40
        : decision.shot === "replay-reverse"
          ? 39
          : decision.shot === "replay-master"
            ? 43
            : decision.shot === "edge"
              ? 42
              : decision.shot === "impact"
                ? 45
                : decision.shot === "duel"
                  ? 44
                  : 50;
    const targetFov = baseFov + this.cameraFovKick;
    const nextFov = THREE.MathUtils.lerp(
      this.camera.fov,
      targetFov,
      decision.replay ? 0.32 : 0.22,
    );
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


function usesFacingYaw(state: PlayerState) {
  return (
    state === "idle" ||
    state === "moving" ||
    state === "pushing" ||
    state === "grabbing" ||
    state === "throwing" ||
    state === "climbing" ||
    state === "celebrate"
  );
}

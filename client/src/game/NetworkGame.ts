import * as THREE from "three";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import type { GameEvent, MatchSnapshot, PlayerSnapshot, PlayerState } from "@waiting/shared";
import { createCharacterVisual, type CharacterVisual } from "./CharacterVisual";

type View = {
  root: THREE.Group;
  visual?: CharacterVisual;
  label: THREE.Sprite;
  targetPosition: THREE.Vector3;
  targetQuaternion: THREE.Quaternion;
  name: string;
  state: PlayerState;
};

type ReplayState = {
  frames: MatchSnapshot[];
  startedAt: number;
  loopsRemaining: number;
  closeCamera: boolean;
};

type Options = {
  container: HTMLElement;
  timer: HTMLElement;
  message: HTMLElement;
  status: HTMLElement;
  qr: HTMLCanvasElement;
  joinText: HTMLElement;
  ranking: HTMLElement;
};

const REPLAY_SPEED = 0.45;
const REPLAY_LOOKBACK_MS = 1_800;

export class NetworkGame {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly clock = new THREE.Clock();
  private readonly views = new Map<string, View>();
  private readonly history: MatchSnapshot[] = [];
  private latest?: MatchSnapshot;
  private replay?: ReplayState;
  private animationFrame = 0;
  private cameraImpulse = 0;
  private readonly cameraLook = new THREE.Vector3();

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
    this.scene.background = new THREE.Color(0x101827);
    this.scene.fog = new THREE.Fog(0x101827, 15, 29);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));

    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(6, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 0.5, 64),
      new THREE.MeshStandardMaterial({ color: 0xf0b35b, roughness: 0.72 }),
    );
    table.position.y = -0.25;
    table.receiveShadow = true;
    this.scene.add(table);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(5.92, 0.08, 10, 96),
      new THREE.MeshStandardMaterial({ color: 0xffdf9b, emissive: 0x3a2200 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.04;
    this.scene.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 2.2, 3.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x6b3f25, roughness: 0.8 }),
    );
    pedestal.position.y = -2;
    this.scene.add(pedestal);

    this.camera.position.set(0, 10.5, 11.5);
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
      const impulse =
        event.type === "final_elimination" ? 0.52 :
        event.type === "big_fall" ? 0.32 :
        event.type === "push_hit" ? 0.12 + event.importance * 0.16 :
        0.08;
      this.cameraImpulse = Math.max(this.cameraImpulse, impulse);
    });
  }

  private receive(snapshot: MatchSnapshot) {
    this.latest = snapshot;
    this.history.push(snapshot);

    const cutoff = snapshot.serverTimeMs - 7_000;
    while (this.history.length && this.history[0].serverTimeMs < cutoff) {
      this.history.shift();
    }

    const finalEvent = snapshot.events.find((event) => event.type === "final_elimination");
    if (finalEvent && !this.replay) {
      const frames = this.history.filter(
        (frame) =>
          frame.serverTimeMs >= finalEvent.atMs - REPLAY_LOOKBACK_MS &&
          frame.serverTimeMs <= finalEvent.atMs,
      );

      if (frames.length >= 4) {
        this.replay = {
          frames,
          startedAt: performance.now(),
          loopsRemaining: 2,
          closeCamera: false,
        };
        return;
      }
    }

    if (!this.replay) this.applySnapshot(snapshot);
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

    const view: View = {
      root,
      label,
      targetPosition: new THREE.Vector3(...player.position),
      targetQuaternion: new THREE.Quaternion(...player.rotation),
      name: player.name,
      state: player.state,
    };

    this.views.set(player.id, view);

    createCharacterVisual(tint, 1.7).then((visual) => {
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
    if (view.name === player.name && Boolean(view.label.userData.bot) === player.bot) return;

    this.scene.remove(view.label);
    (view.label.material as THREE.SpriteMaterial).map?.dispose();
    (view.label.material as THREE.Material).dispose();
    view.label = this.makeLabel(player.name, player.bot);
    view.label.userData.bot = player.bot;
    view.name = player.name;
    this.scene.add(view.label);
  }

  private applySnapshot(snapshot: MatchSnapshot) {
    this.options.timer.textContent = String(Math.ceil(snapshot.timeLeftMs / 1000));
    this.renderRanking(snapshot);

    for (const player of snapshot.players) {
      const view = this.views.get(player.id) ?? this.createView(player);
      this.refreshLabel(view, player);
      view.targetPosition.set(...player.position);
      if (
        (player.state === "idle" || player.state === "moving" || player.state === "pushing") &&
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
    }

    if (!this.replay && snapshot.phase === "countdown") {
      const count = Math.max(1, Math.ceil((snapshot.countdownLeftMs ?? 0) / 1000));
      this.options.message.textContent = String(count);
    } else if (!this.replay && snapshot.phase === "finished") {
      const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
      this.options.message.textContent = winner ? `🏆 ${winner.name} 获胜` : "本局结束";
    } else if (!this.replay && snapshot.phase === "playing") {
      this.options.message.textContent = "";
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
      ? "🎥 决胜回放 · 近景"
      : "🎥 精彩回放 ×0.45";
    this.applySnapshot(frame);
  }

  private loop = () => {
    this.animationFrame = requestAnimationFrame(this.loop);
    const now = performance.now();

    if (this.replay) this.updateReplay(now);

    const delta = Math.min(this.clock.getDelta(), 0.05);

    for (const view of this.views.values()) {
      view.root.position.lerp(view.targetPosition, this.replay ? 0.42 : 0.28);
      view.root.quaternion.slerp(view.targetQuaternion, this.replay ? 0.5 : 0.32);
      view.visual?.update(delta);
      view.label.position.copy(view.root.position).add(new THREE.Vector3(0, 1.65, 0));
    }

    const alive = this.latest?.players.filter((player) => !player.eliminated) ?? [];
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

    const hanging = alive.find((player) => player.state === "edge_hang");
    if (hanging && !this.replay) {
      centerX = centerX * 0.55 + hanging.position[0] * 0.45;
      centerZ = centerZ * 0.55 + hanging.position[2] * 0.45;
    }

    const cameraTarget = this.replay?.closeCamera
      ? new THREE.Vector3(centerX, 7.6, centerZ + 8.2)
      : new THREE.Vector3(
          centerX,
          9.2 + spread * 0.32,
          centerZ + 9.6 + spread * 0.38,
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

    this.camera.lookAt(this.cameraLook);
    this.renderer.render(this.scene, this.camera);
  };
}


function isMostlyUpright(rotation: [number, number, number, number]) {
  const [x, , z] = rotation;
  const upY = 1 - 2 * (x * x + z * z);
  return upY > 0.72;
}

import { io } from "socket.io-client";
import type { GameEvent, MatchSnapshot } from "@waiting/shared";
import { PersonalGameView } from "./PersonalGameView";
import { AudioFx } from "./AudioFx";
import "./style.css";

const DEBUG_MODE = new URLSearchParams(location.search).get("debug") === "1";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <main class="controller">
    <div class="personal-stage" id="personal-stage"></div>

    <header class="top-hud">
      <div>
        <strong>餐桌推推王</strong>
        <span id="identity">等待分配角色</span>
      </div>
      <div class="match-meta">
        <span id="stage">OPENING</span>
        <span id="timer">3:00</span>
        <span id="score">击落 0</span>
      </div>
      <span id="status">连接中…</span>
    </header>

    <div class="state-pill" id="state-pill">准备加入</div>

    <div class="stamina-hud" id="stamina-hud">
      <span>体力</span>
      <div class="stamina-track"><i id="stamina-fill"></i></div>
    </div>

    <section class="play-area" aria-label="游戏操作">
      <div class="joystick" id="joystick" aria-label="移动摇杆">
        <div class="sprint-ring">冲刺</div>
        <div class="stick" id="stick"></div>
      </div>

      <div class="action-cluster">
        <button class="grab" id="grab" type="button">
          <span>抓取</span>
          <small>按住</small>
        </button>
        <button class="push attack" id="push" type="button">
          <span>出拳</span>
          <small>快速攻击</small>
        </button>
      </div>
    </section>

    <div class="rotate-hint">横屏体验更好</div>
    <aside class="debug-panel" id="debug-panel" hidden></aside>
  </main>
`;

const status = document.querySelector<HTMLSpanElement>("#status")!;
const identity = document.querySelector<HTMLSpanElement>("#identity")!;
const timer = document.querySelector<HTMLSpanElement>("#timer")!;
const stageLabel = document.querySelector<HTMLSpanElement>("#stage")!;
const score = document.querySelector<HTMLSpanElement>("#score")!;
const staminaHud = document.querySelector<HTMLDivElement>("#stamina-hud")!;
const staminaFill = document.querySelector<HTMLElement>("#stamina-fill")!;
const statePill = document.querySelector<HTMLDivElement>("#state-pill")!;
const joystick = document.querySelector<HTMLDivElement>("#joystick")!;
const stick = document.querySelector<HTMLDivElement>("#stick")!;
const pushButton = document.querySelector<HTMLButtonElement>("#push")!;
const pushLabel = pushButton.querySelector<HTMLElement>("span")!;
const pushHint = pushButton.querySelector<HTMLElement>("small")!;
const grabButton = document.querySelector<HTMLButtonElement>("#grab")!;
const grabLabel = grabButton.querySelector<HTMLElement>("span")!;
const grabHint = grabButton.querySelector<HTMLElement>("small")!;
const stage = document.querySelector<HTMLDivElement>("#personal-stage")!;
const controllerEl = document.querySelector<HTMLElement>(".controller")!;
const debugPanel = document.querySelector<HTMLElement>("#debug-panel")!;
debugPanel.hidden = !DEBUG_MODE;

const personalView = new PersonalGameView(stage);
const audioFx = new AudioFx();
personalView.start();

const endpoint = `${location.protocol}//${location.hostname}:3001`;
const socket = io(endpoint, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 350,
  reconnectionDelayMax: 1_500,
});

const SESSION_KEY = "waiting-entertainment.session-id";
const NAME_KEY = "waiting-entertainment.player-name";

function makeSessionId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const sessionId = localStorage.getItem(SESSION_KEY) || makeSessionId();
localStorage.setItem(SESSION_KEY, sessionId);

const savedName = localStorage.getItem(NAME_KEY);
const defaultName = savedName || `玩家${sessionId.replace(/-/g, "").slice(-4).toUpperCase()}`;
localStorage.setItem(NAME_KEY, defaultName);

let ownedPlayerId = "";
let moveX = 0;
let moveY = 0;
let pushing = false;
let grabbing = false;
let sprinting = false;
let activePointer: number | null = null;
let inputSeq = 0;
let pushCooldownLeftMs = 0;
let eliminated = false;
let actionDisabled = false;
let rttMs = 0;
let snapshotCounter = 0;
let snapshotRate = 0;
let snapshotWindowStartedAt = performance.now();

socket.on("connect", () => {
  status.textContent = "正在接管角色…";
  socket.emit(
    "join",
    { sessionId, name: defaultName },
    (response: {
      ok?: boolean;
      recovered?: boolean;
      playerId?: string;
      name?: string;
      sessionId?: string;
      reason?: string;
    }) => {
      if (!response?.ok || !response.playerId) {
        status.textContent = response?.reason === "session-full" ? "当前对局已满" : "加入失败";
        status.classList.remove("online");
        return;
      }

      if (response.sessionId) localStorage.setItem(SESSION_KEY, response.sessionId);
      ownedPlayerId = response.playerId;
      personalView.setOwnedPlayer(ownedPlayerId);
      identity.textContent = response.name || defaultName;
      status.textContent = response.recovered ? "已恢复控制" : "已加入";
      status.classList.add("online");
    },
  );
});

socket.on("disconnect", () => {
  status.textContent = "重连中…";
  status.classList.remove("online");
});

socket.on("game:event", (event: GameEvent) => {
  if (!ownedPlayerId) return;

  const isMine = event.targetId === ownedPlayerId || event.actorId === ownedPlayerId;
  if (isMine) audioFx.play(event.type, event.importance);

  if (event.targetId === ownedPlayerId) {
    if (event.type !== "grab") {
      personalView.addImpact(event.importance, true);
    }
    controllerEl.classList.remove("hit-flash");
    void controllerEl.offsetWidth;
    controllerEl.classList.add("hit-flash");
    window.setTimeout(() => controllerEl.classList.remove("hit-flash"), 220);

    if ("vibrate" in navigator) {
      navigator.vibrate(
        event.type === "final_elimination"
          ? [55, 30, 80]
          : event.type === "toss"
            ? [45, 20, 65]
            : event.type === "heavy_hit"
              ? [36, 18, 54]
              : event.type === "grab"
                ? 24
                : 42,
      );
    }
  } else if (
    event.actorId === ownedPlayerId &&
    (
      event.type === "push_hit" ||
      event.type === "punch_hit" ||
      event.type === "heavy_hit" ||
      event.type === "grab" ||
      event.type === "toss"
    )
  ) {
    if (event.type !== "grab") {
      personalView.addImpact(
        event.type === "toss" || event.type === "heavy_hit"
          ? 1
          : event.importance,
        false,
      );
    }
    controllerEl.classList.remove("hit-confirm");
    void controllerEl.offsetWidth;
    controllerEl.classList.add("hit-confirm");
    window.setTimeout(() => controllerEl.classList.remove("hit-confirm"), 180);

    if ("vibrate" in navigator) {
      navigator.vibrate(
        event.type === "toss"
          ? [24, 18, 36]
          : event.type === "heavy_hit"
            ? [22, 12, 30]
            : event.type === "grab"
              ? 12
              : 16,
      );
    }
  }
});

socket.on("match:snapshot", (snapshot: MatchSnapshot) => {
  snapshotCounter += 1;
  const snapshotNow = performance.now();
  const snapshotElapsed = snapshotNow - snapshotWindowStartedAt;
  if (snapshotElapsed >= 1_000) {
    snapshotRate = (snapshotCounter * 1_000) / snapshotElapsed;
    snapshotCounter = 0;
    snapshotWindowStartedAt = snapshotNow;
  }

  personalView.update(snapshot);
  const totalSeconds = Math.max(0, Math.ceil(snapshot.timeLeftMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  timer.textContent = `${minutes}:${seconds}`;

  const stageNames = {
    opening: "OPENING",
    brawl: "BRAWL",
    danger: "DANGER",
    final: "FINAL",
  } as const;
  stageLabel.textContent = stageNames[snapshot.matchStage];
  stageLabel.dataset.stage = snapshot.matchStage;

  const tension =
    snapshot.phase === "playing" && snapshot.matchStage === "final";
  timer.classList.toggle("danger", tension);
  controllerEl.classList.toggle("tension", tension);

  if (!ownedPlayerId) return;
  const me = snapshot.players.find((player) => player.id === ownedPlayerId);
  if (!me) return;

  score.textContent = `击落 ${me.score}`;
  eliminated = me.eliminated;
  controllerEl.classList.toggle("spectating", eliminated);

  staminaFill.style.transform = `scaleX(${Math.max(0, Math.min(1, me.stamina))})`;
  staminaHud.classList.toggle("low", me.stamina <= 0.22);
  staminaHud.classList.toggle("sprinting", me.sprinting);

  pushCooldownLeftMs = me.pushCooldownLeftMs;
  const cooldownProgress = 1 - Math.min(1, pushCooldownLeftMs / 850);
  pushButton.style.setProperty("--cooldown-angle", `${cooldownProgress * 360}deg`);
  pushButton.classList.toggle("cooling", pushCooldownLeftMs > 45);

  const grabbedTarget = me.grabTargetId
    ? snapshot.players.find((player) => player.id === me.grabTargetId)
    : undefined;

  const spawnProtected = me.spawnProtectionLeftMs > 0;
  actionDisabled = me.state === "carried";
  const attackDisabled =
    actionDisabled || spawnProtected || pushCooldownLeftMs > 45;
  const grabDisabled =
    actionDisabled ||
    spawnProtected ||
    me.state === "throwing" ||
    me.state === "edge_hang" ||
    me.state === "climbing";

  pushButton.classList.toggle("action-disabled", attackDisabled);
  grabButton.classList.toggle("action-disabled", grabDisabled);
  grabButton.classList.toggle("holding", Boolean(grabbedTarget));

  if (spawnProtected) {
    pushLabel.textContent = "保护中";
    pushHint.textContent = "先找位置";
    grabLabel.textContent = "保护中";
    grabHint.textContent = "短暂无敌";
  } else if (me.state === "carried") {
    pushLabel.textContent = "被抓住";
    pushHint.textContent = "挣脱中";
    grabLabel.textContent = "被控制";
    grabHint.textContent = "等机会";
  } else if (grabbedTarget) {
    pushLabel.textContent = "甩飞";
    pushHint.textContent = "按摇杆方向";
    grabLabel.textContent = "抓住中";
    grabHint.textContent = grabbedTarget.name;
  } else if (me.sprinting && me.stamina >= 0.17) {
    pushLabel.textContent = "重击";
    pushHint.textContent = "冲刺攻击";
    grabLabel.textContent = "抓取";
    grabHint.textContent = "按住";
  } else {
    pushLabel.textContent = "出拳";
    pushHint.textContent =
      pushCooldownLeftMs > 45
        ? `${(pushCooldownLeftMs / 1000).toFixed(1)}s`
        : "快速攻击";
    grabLabel.textContent = "抓取";
    grabHint.textContent = "按住";
  }

  if (snapshot.phase === "countdown") {
    statePill.textContent = `${Math.max(1, Math.ceil((snapshot.countdownLeftMs ?? 0) / 1000))}`;
  } else if (me.eliminated) {
    const alive = snapshot.players
      .filter((player) => !player.eliminated)
      .sort((a, b) => b.score - a.score);
    const target = snapshot.winnerId
      ? snapshot.players.find((player) => player.id === snapshot.winnerId)
      : alive[0];
    statePill.textContent = target
      ? `已淘汰 · 观战 ${target.name}`
      : "已淘汰 · 等待下一局";
  } else if (spawnProtected) {
    statePill.textContent =
      `回场保护 · ${(me.spawnProtectionLeftMs / 1000).toFixed(1)}s`;
  } else if (me.state === "grabbing") {
    statePill.textContent = "抓住了！移动可以拖走 · 攻击键甩飞";
  } else if (me.state === "carried") {
    statePill.textContent = "被抓住了！";
  } else if (me.state === "throwing") {
    statePill.textContent = "甩出去！";
  } else if (me.state === "edge_hang") {
    statePill.textContent = "抓住了！摇杆推向桌内";
  } else if (me.state === "climbing") {
    statePill.textContent = "正在爬回桌面！";
  } else if (me.state === "hit" || me.state === "ragdoll") {
    statePill.textContent = "被撞倒！";
  } else if (me.state === "recovering") {
    statePill.textContent = "正在爬起来";
  } else if (snapshot.phase === "finished") {
    statePill.textContent = snapshot.winnerId === ownedPlayerId ? "🏆 你赢了" : "本局结束";
  } else if (snapshot.matchStage === "opening") {
    statePill.textContent = "外圈推满摇杆冲刺 · 近身出拳";
  } else if (snapshot.matchStage === "brawl") {
    statePill.textContent = "打倒 · 抓住 · 拖走 · 甩飞";
  } else if (snapshot.matchStage === "danger") {
    statePill.textContent = "危险升级！注意桌边和体力";
  } else {
    statePill.textContent = "FINAL CHAOS · 活到最后";
  }
});

function sendInput() {
  if (!socket.connected || !ownedPlayerId || eliminated) return;
  inputSeq += 1;
  socket.emit("input", {
    seq: inputSeq,
    moveX,
    moveY,
    push: pushing,
    attack: pushing,
    grab: grabbing,
    sprint: sprinting,
  });
}

function updateStick(clientX: number, clientY: number) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const max = rect.width * 0.32;
  const length = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, max / length);
  const px = dx * scale;
  const py = dy * scale;

  stick.style.transform = `translate(${px}px, ${py}px)`;

  const screenX = Math.max(-1, Math.min(1, dx / max));
  const screenY = Math.max(-1, Math.min(1, dy / max));
  const worldInput = personalView.toWorldInput(screenX, screenY);

  moveX = worldInput.x;
  moveY = worldInput.z;
  const rawMagnitude = Math.min(1, Math.hypot(dx, dy) / max);
  sprinting = rawMagnitude >= 0.82;
  joystick.classList.toggle("sprinting", sprinting);
  sendInput();
}

joystick.addEventListener("pointerdown", (event) => {
  activePointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateStick(event.clientX, event.clientY);
});

joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId !== activePointer) return;
  updateStick(event.clientX, event.clientY);
});

function releaseStick(event: PointerEvent) {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  moveX = 0;
  moveY = 0;
  sprinting = false;
  joystick.classList.remove("sprinting");
  stick.style.transform = "translate(0, 0)";
  sendInput();
}

joystick.addEventListener("pointerup", releaseStick);
joystick.addEventListener("pointercancel", releaseStick);

pushButton.addEventListener("pointerdown", () => {
  if (eliminated || actionDisabled) return;
  if (pushCooldownLeftMs > 45) {
    if ("vibrate" in navigator) navigator.vibrate(7);
    return;
  }

  pushing = true;
  pushButton.classList.add("active");
  if ("vibrate" in navigator) navigator.vibrate(18);
  sendInput();
});

function releasePush() {
  pushing = false;
  pushButton.classList.remove("active");
  sendInput();
}

pushButton.addEventListener("pointerup", releasePush);
pushButton.addEventListener("pointercancel", releasePush);
pushButton.addEventListener("pointerleave", releasePush);

grabButton.addEventListener("pointerdown", () => {
  if (eliminated || actionDisabled) return;
  grabbing = true;
  grabButton.classList.add("active");
  if ("vibrate" in navigator) navigator.vibrate(10);
  sendInput();
});

function releaseGrab() {
  grabbing = false;
  grabButton.classList.remove("active");
  sendInput();
}

grabButton.addEventListener("pointerup", releaseGrab);
grabButton.addEventListener("pointercancel", releaseGrab);
grabButton.addEventListener("pointerleave", releaseGrab);

function clearHeldInput() {
  moveX = 0;
  moveY = 0;
  pushing = false;
  grabbing = false;
  sprinting = false;
  activePointer = null;
  stick.style.transform = "translate(0, 0)";
  joystick.classList.remove("sprinting");
  pushButton.classList.remove("active");
  grabButton.classList.remove("active");
  sendInput();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearHeldInput();
});

window.addEventListener("pagehide", clearHeldInput);
window.addEventListener("blur", clearHeldInput);


if (DEBUG_MODE) {
  window.setInterval(() => {
    if (!socket.connected) return;
    const startedAt = performance.now();
    socket.emit("latency:ping", {}, () => {
      rttMs = performance.now() - startedAt;
    });
  }, 2_000);

  window.setInterval(() => {
    const stats = personalView.getPerformanceStats();
    const transport = socket.io.engine?.transport?.name ?? "unknown";

    debugPanel.textContent = [
      `FPS ${stats.fps}`,
      `DPR ${stats.pixelRatio}`,
      `QUALITY ${stats.quality}`,
      `RTT ${Math.round(rttMs)}ms`,
      `SNAP ${snapshotRate.toFixed(1)}/s`,
      `NET ${transport}`,
    ].join(" · ");
  }, 500);
}

import { io } from "socket.io-client";
import type { GameEvent, MatchSnapshot } from "@waiting/shared";
import { PersonalGameView } from "./PersonalGameView";
import { AudioFx } from "./AudioFx";
import "./style.css";

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
        <span id="timer">60</span>
        <span id="score">击落 0</span>
      </div>
      <span id="status">连接中…</span>
    </header>

    <div class="state-pill" id="state-pill">准备加入</div>

    <section class="play-area" aria-label="游戏操作">
      <div class="joystick" id="joystick" aria-label="移动摇杆">
        <div class="stick" id="stick"></div>
      </div>
      <button class="push" id="push" type="button">
        <span>冲撞</span>
        <small>撞飞他</small>
      </button>
    </section>

    <div class="rotate-hint">横屏体验更好</div>
  </main>
`;

const status = document.querySelector<HTMLSpanElement>("#status")!;
const identity = document.querySelector<HTMLSpanElement>("#identity")!;
const timer = document.querySelector<HTMLSpanElement>("#timer")!;
const score = document.querySelector<HTMLSpanElement>("#score")!;
const statePill = document.querySelector<HTMLDivElement>("#state-pill")!;
const joystick = document.querySelector<HTMLDivElement>("#joystick")!;
const stick = document.querySelector<HTMLDivElement>("#stick")!;
const pushButton = document.querySelector<HTMLButtonElement>("#push")!;
const pushHint = pushButton.querySelector<HTMLElement>("small")!;
const stage = document.querySelector<HTMLDivElement>("#personal-stage")!;
const controllerEl = document.querySelector<HTMLElement>(".controller")!;

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
let activePointer: number | null = null;
let inputSeq = 0;
let pushCooldownLeftMs = 0;
let eliminated = false;

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
        status.textContent = response?.reason === "session-full" ? "当前8位已满" : "加入失败";
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
    controllerEl.classList.remove("hit-flash");
    void controllerEl.offsetWidth;
    controllerEl.classList.add("hit-flash");
    window.setTimeout(() => controllerEl.classList.remove("hit-flash"), 220);

    if ("vibrate" in navigator) {
      navigator.vibrate(event.type === "final_elimination" ? [55, 30, 80] : 42);
    }
  } else if (event.actorId === ownedPlayerId && event.type === "push_hit") {
    controllerEl.classList.remove("hit-confirm");
    void controllerEl.offsetWidth;
    controllerEl.classList.add("hit-confirm");
    window.setTimeout(() => controllerEl.classList.remove("hit-confirm"), 180);

    if ("vibrate" in navigator) navigator.vibrate(16);
  }
});

socket.on("match:snapshot", (snapshot: MatchSnapshot) => {
  personalView.update(snapshot);
  timer.textContent = String(Math.ceil(snapshot.timeLeftMs / 1000));
  const tension = snapshot.phase === "playing" && snapshot.timeLeftMs <= 10_000;
  timer.classList.toggle("danger", tension);
  controllerEl.classList.toggle("tension", tension);

  if (!ownedPlayerId) return;
  const me = snapshot.players.find((player) => player.id === ownedPlayerId);
  if (!me) return;

  score.textContent = `击落 ${me.score}`;
  eliminated = me.eliminated;
  controllerEl.classList.toggle("spectating", eliminated);
  pushCooldownLeftMs = me.pushCooldownLeftMs;
  const cooldownProgress = 1 - Math.min(1, pushCooldownLeftMs / 850);
  pushButton.style.setProperty("--cooldown-angle", `${cooldownProgress * 360}deg`);
  pushButton.classList.toggle("cooling", pushCooldownLeftMs > 45);
  pushHint.textContent = pushCooldownLeftMs > 45
    ? `${(pushCooldownLeftMs / 1000).toFixed(1)}s`
    : "撞飞他";

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
  } else {
    statePill.textContent = "把别人撞下桌！";
  }
});

function sendInput() {
  if (!socket.connected || !ownedPlayerId || eliminated) return;
  inputSeq += 1;
  socket.emit("input", { seq: inputSeq, moveX, moveY, push: pushing });
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
  moveX = Math.max(-1, Math.min(1, dx / max));
  // Camera looks toward -Z. Finger-up therefore maps to -Z so the avatar
  // moves visually toward the top of the phone screen.
  moveY = Math.max(-1, Math.min(1, dy / max));
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
  stick.style.transform = "translate(0, 0)";
  sendInput();
}

joystick.addEventListener("pointerup", releaseStick);
joystick.addEventListener("pointercancel", releaseStick);

pushButton.addEventListener("pointerdown", () => {
  if (eliminated) return;
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

function clearHeldInput() {
  moveX = 0;
  moveY = 0;
  pushing = false;
  activePointer = null;
  stick.style.transform = "translate(0, 0)";
  pushButton.classList.remove("active");
  sendInput();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearHeldInput();
});

window.addEventListener("pagehide", clearHeldInput);
window.addEventListener("blur", clearHeldInput);

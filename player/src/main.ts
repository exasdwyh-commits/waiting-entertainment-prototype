import { io } from "socket.io-client";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <main class="controller">
    <header>
      <strong>餐桌推推王</strong>
      <span id="status">连接中…</span>
    </header>
    <section class="play-area">
      <div class="joystick" id="joystick" aria-label="移动摇杆">
        <div class="stick" id="stick"></div>
      </div>
      <button class="push" id="push" type="button">冲撞</button>
    </section>
    <p>左手移动 · 右手冲撞</p>
  </main>
`;

const status = document.querySelector<HTMLSpanElement>("#status")!;
const joystick = document.querySelector<HTMLDivElement>("#joystick")!;
const stick = document.querySelector<HTMLDivElement>("#stick")!;
const pushButton = document.querySelector<HTMLButtonElement>("#push")!;

const endpoint = `${location.protocol}//${location.hostname}:3001`;
const socket = io(endpoint, { transports: ["websocket", "polling"] });

let moveX = 0;
let moveY = 0;
let pushing = false;
let activePointer: number | null = null;

socket.on("connect", () => {
  const suffix = socket.id?.slice(0, 4) ?? "guest";
  socket.emit("join", { name: `Player-${suffix}` }, () => {
    status.textContent = "已加入";
    status.classList.add("online");
  });
});

socket.on("disconnect", () => {
  status.textContent = "重连中…";
  status.classList.remove("online");
});

function sendInput() {
  socket.emit("input", { moveX, moveY, push: pushing });
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
  moveY = Math.max(-1, Math.min(1, -dy / max));
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
  pushing = true;
  pushButton.classList.add("active");
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

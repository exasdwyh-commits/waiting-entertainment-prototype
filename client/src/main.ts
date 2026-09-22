import "./style.css";
import { NetworkGame } from "./game/NetworkGame";

const root = document.querySelector<HTMLDivElement>("#app")!;
const params = new URLSearchParams(location.search);
const localMode = params.get("mode") === "local";
const hubMode = params.get("hub") === "1";
const shellOwnsQueue = params.get("shellQueue") === "1";

root.innerHTML = `
  <div id="stage"></div>
  <section class="hud">
    <div>
      <span class="eyebrow">WAITING ENTERTAINMENT</span>
      <h1>餐桌推推王</h1>
      <span id="status">${localMode ? "本地调试模式" : "连接服务器中"}</span>
    </div>
    <div class="timer"><span id="timer">3:00</span></div>
  </section>
  <ol class="ranking" id="ranking" aria-label="实时排名"></ol>
  <aside class="join-panel" id="join-panel">
    <canvas id="qr" width="144" height="144"></canvas>
    <div>
      <strong>扫码加入</strong>
      <span id="join-text">正在生成加入码…</span>
    </div>
  </aside>
  <div class="tip">${localMode ? "WASD / 方向键移动　SPACE 攻击　R 重开" : "外圈冲刺 · 出拳/重击 · 抓取/甩飞 · AI自动补位"}</div>
  <div class="broadcast-bug" id="broadcast-bug" data-mode="live">
    <span id="director-mode">LIVE</span>
    <strong id="director-label">全场主机位</strong>
  </div>
  <div class="replay-wipe" id="replay-wipe">
    <span>WAITING ENTERTAINMENT</span>
    <strong>INSTANT REPLAY</strong>
  </div>
  <div id="message" class="message"></div>
  <aside id="hub-queue-overlay" class="hub-queue-overlay" hidden>
    <span class="hub-queue-dot">●</span>
    <div>
      <small>请准备入座</small>
      <strong id="hub-queue-number">A000</strong>
      <span id="hub-queue-party">2 人桌 · 请前往前台</span>
    </div>
  </aside>
`;

const common = {
  container: document.querySelector<HTMLDivElement>("#stage")!,
  timer: document.querySelector<HTMLSpanElement>("#timer")!,
  message: document.querySelector<HTMLDivElement>("#message")!,
};

const hubQueueOverlay = document.querySelector<HTMLElement>("#hub-queue-overlay")!;
const hubQueueNumber = document.querySelector<HTMLElement>("#hub-queue-number")!;
const hubQueueParty = document.querySelector<HTMLElement>("#hub-queue-party")!;
let lastHubQueueCallKey = "";
let hubQueueTimer: number | undefined;

async function syncHubQueueOverlay() {
  try {
    const response = await fetch(
      location.protocol + "//" + location.hostname + ":3001/api/platform/broadcast",
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const state = (await response.json()) as {
      queueOverlay?: {
        ticketId: string;
        number: string;
        partySize: number;
        calledAt: number;
      };
    };
    const overlay = state.queueOverlay;
    if (!overlay) {
      hubQueueOverlay.hidden = true;
      if (hubQueueTimer !== undefined) {
        window.clearTimeout(hubQueueTimer);
        hubQueueTimer = undefined;
      }
      return;
    }

    const key = overlay.ticketId + ":" + overlay.calledAt;
    if (key === lastHubQueueCallKey) return;
    lastHubQueueCallKey = key;
    hubQueueNumber.textContent = overlay.number;
    hubQueueParty.textContent = overlay.partySize + " 人桌 · 请前往前台";
    hubQueueOverlay.hidden = false;

    if (hubQueueTimer !== undefined) window.clearTimeout(hubQueueTimer);
    hubQueueTimer = window.setTimeout(() => {
      hubQueueOverlay.hidden = true;
      hubQueueTimer = undefined;
    }, 10_000);
  } catch {
    // Live game stays playable even if the optional platform overlay drops out.
  }
}

if (hubMode) {
  document.querySelector<HTMLElement>("#join-panel")!.hidden = true;
  document.querySelector<HTMLElement>(".tip")!.hidden = true;
  if (!shellOwnsQueue) {
    void syncHubQueueOverlay();
    window.setInterval(() => void syncHubQueueOverlay(), 500);
  }
}

if (localMode) {
  document.querySelector<HTMLElement>("#join-panel")!.hidden = true;
  import("./game/LocalPrototype")
    .then(({ LocalPrototype }) => new LocalPrototype(common).start())
    .catch((error) => {
      console.error(error);
      common.message.textContent = "物理引擎初始化失败，请查看控制台";
    });
} else {
  const game = new NetworkGame({
    ...common,
    status: document.querySelector<HTMLSpanElement>("#status")!,
    qr: document.querySelector<HTMLCanvasElement>("#qr")!,
    joinText: document.querySelector<HTMLSpanElement>("#join-text")!,
    ranking: document.querySelector<HTMLOListElement>("#ranking")!,
    broadcastBug: document.querySelector<HTMLDivElement>("#broadcast-bug")!,
    directorMode: document.querySelector<HTMLSpanElement>("#director-mode")!,
    directorLabel: document.querySelector<HTMLElement>("#director-label")!,
    replayWipe: document.querySelector<HTMLDivElement>("#replay-wipe")!,
  });
  game.start();

  if (params.get("visualPreview") === "1") {
    type VisualPreviewWindow = Window & {
      __waitingVisualReplay?: () => boolean;
    };
    (window as VisualPreviewWindow).__waitingVisualReplay = () =>
      game.previewReplay();
  }
}

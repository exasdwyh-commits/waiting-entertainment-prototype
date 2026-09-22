import QRCode from "qrcode";
import type { GameManifestV1, PlatformSnapshot } from "@waiting/shared";
import "./style.css";

const API = location.protocol + "//" + location.hostname + ":3001/api/platform";
const root = document.querySelector<HTMLDivElement>("#app")!;

root.innerHTML =
  '<main class="broadcast-shell">' +
    '<iframe id="game-frame" class="game-frame" title="游戏导播画面"></iframe>' +
    '<section id="idle" class="scene scene--idle"><div class="brand-lockup"><span>WAITING</span><strong>ENTERTAINMENT</strong></div>' +
      '<h1>现场互动正在准备</h1><p>留意主持人和大屏，下一轮很快开始</p></section>' +
    '<section id="recruit" class="scene scene--recruit" hidden><div class="recruit-copy"><span class="eyebrow">OPEN REGISTRATION</span>' +
      '<h1 id="game-name">现场互动</h1><p id="game-summary"></p><div class="seat-progress"><strong id="seat-count">0 / 0</strong><span>已报名</span></div>' +
      '<div id="player-names" class="player-names"></div></div><div class="qr-card"><canvas id="qr" width="280" height="280"></canvas>' +
      '<span>扫码报名本轮</span><strong id="round-code">------</strong></div></section>' +
    '<section id="ready" class="scene scene--ready" hidden><span class="eyebrow">PLAYERS READY</span><h1 id="ready-game">选手集结完毕</h1>' +
      '<div id="ready-players" class="ready-players"></div><p>主持人即将开局</p></section>' +
    '<section id="result" class="scene scene--result" hidden><span class="eyebrow">ROUND COMPLETE</span><h1>本轮结束</h1>' +
      '<p>精彩回放 / 排名接口将在导播 SDK 阶段接入</p><div class="result-line"></div></section>' +
    '<div class="corner-brand"><span>WE</span><strong id="mode-label">IDLE_MEDIA</strong></div>' +
    '<aside id="queue-overlay" class="queue-overlay" hidden><span class="bell">●</span><div><small>请准备入座</small>' +
      '<strong id="queue-number">A000</strong><span id="queue-party">2 人桌 · 请前往前台</span></div></aside>' +
    '<div id="offline" class="offline" hidden>Hub 离线 · 正在重连</div>' +
  '</main>';

const gameFrame = document.querySelector<HTMLIFrameElement>("#game-frame")!;
const idle = document.querySelector<HTMLElement>("#idle")!;
const recruit = document.querySelector<HTMLElement>("#recruit")!;
const ready = document.querySelector<HTMLElement>("#ready")!;
const result = document.querySelector<HTMLElement>("#result")!;
const gameName = document.querySelector<HTMLElement>("#game-name")!;
const gameSummary = document.querySelector<HTMLElement>("#game-summary")!;
const seatCount = document.querySelector<HTMLElement>("#seat-count")!;
const playerNames = document.querySelector<HTMLElement>("#player-names")!;
const readyGame = document.querySelector<HTMLElement>("#ready-game")!;
const readyPlayers = document.querySelector<HTMLElement>("#ready-players")!;
const roundCode = document.querySelector<HTMLElement>("#round-code")!;
const modeLabel = document.querySelector<HTMLElement>("#mode-label")!;
const qrCanvas = document.querySelector<HTMLCanvasElement>("#qr")!;
const queueOverlay = document.querySelector<HTMLElement>("#queue-overlay")!;
const queueNumber = document.querySelector<HTMLElement>("#queue-number")!;
const queueParty = document.querySelector<HTMLElement>("#queue-party")!;
const offline = document.querySelector<HTMLElement>("#offline")!;

let lastQrCode = "";
let lastFrameUrl = "";
let lastQueueCallKey = "";
let queueOverlayTimer: number | undefined;

function presentQueueCall(overlay: NonNullable<PlatformSnapshot["broadcast"]["queueOverlay"]>) {
  const key = overlay.ticketId + ":" + overlay.calledAt;
  if (key === lastQueueCallKey) return;

  lastQueueCallKey = key;
  queueNumber.textContent = overlay.number;
  queueParty.textContent = overlay.partySize + " 人桌 · 请前往前台";
  queueOverlay.hidden = false;

  if (queueOverlayTimer !== undefined) window.clearTimeout(queueOverlayTimer);
  queueOverlayTimer = window.setTimeout(() => {
    queueOverlay.hidden = true;
    queueOverlayTimer = undefined;
  }, 10_000);
}

function entryUrl(game: GameManifestV1, kind: "display" | "player"): string {
  const raw = game.entrypoints[kind].replaceAll("{host}", location.hostname);
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return location.protocol + "//" + location.hostname + raw;
}

function hubDisplayUrl(game: GameManifestV1): string {
  const base = entryUrl(game, "display");
  const url = new URL(base);
  url.searchParams.set("hub", "1");
  return url.toString();
}

function setScene(mode: PlatformSnapshot["broadcast"]["mode"]) {
  idle.hidden = mode !== "IDLE_MEDIA";
  recruit.hidden = mode !== "RECRUITING";
  ready.hidden = mode !== "READY" && mode !== "COUNTDOWN";
  result.hidden = mode !== "RESULT" && mode !== "HIGHLIGHT";
  gameFrame.classList.toggle("game-frame--active", mode === "LIVE_GAME");
  modeLabel.textContent = mode;
}

async function renderQr(code: string) {
  if (!code || code === lastQrCode) return;
  lastQrCode = code;
  const joinUrl = location.protocol + "//" + location.hostname + ":5177/join/" + encodeURIComponent(code);
  await QRCode.toCanvas(qrCanvas, joinUrl, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#07100d", light: "#f4fff9" },
  });
}

function playersHtml(players: Array<{ name: string }>, limit: number): string {
  const cells = Array.from({ length: limit }, (_, index) => players[index]);
  return cells.map((player, index) =>
    '<span class="' + (player ? "filled" : "") + '"><small>' + String(index + 1).padStart(2, "0") + '</small>' +
      '<strong>' + (player ? escapeText(player.name) : "OPEN") + '</strong></span>'
  ).join("");
}

function escapeText(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function refresh() {
  try {
    const response = await fetch(API, { cache: "no-store" });
    if (!response.ok) throw new Error("platform-offline");
    const snapshot = (await response.json()) as PlatformSnapshot;
    offline.hidden = true;

    const state = snapshot.broadcast;
    const round = state.round;
    const game = round ? snapshot.games.find((item) => item.id === round.gameId) : undefined;
    setScene(state.mode);

    if (round && game) {
      if (state.mode === "RECRUITING") {
        gameName.textContent = game.name;
        gameSummary.textContent = game.summary;
        seatCount.textContent = round.players.length + " / " + round.playerLimit;
        playerNames.innerHTML = playersHtml(round.players, round.playerLimit);
        roundCode.textContent = round.code;
        void renderQr(round.code);
      }

      if (state.mode === "READY" || state.mode === "COUNTDOWN") {
        readyGame.textContent = game.name;
        readyPlayers.innerHTML = playersHtml(round.players, round.playerLimit);
      }

      if (state.mode === "LIVE_GAME") {
        const nextFrame = hubDisplayUrl(game);
        if (lastFrameUrl !== nextFrame) {
          lastFrameUrl = nextFrame;
          gameFrame.src = nextFrame;
        }
      }
    }

    const gameOwnsLiveQueueOverlay =
      state.mode === "LIVE_GAME" && game?.runtime.kind === "embedded";

    if (gameOwnsLiveQueueOverlay) {
      // Embedded games can render the call inside their own DOM. External
      // process games stay behind the shell-level overlay.
      queueOverlay.hidden = true;
      if (queueOverlayTimer !== undefined) {
        window.clearTimeout(queueOverlayTimer);
        queueOverlayTimer = undefined;
      }
    } else if (state.queueOverlay) {
      presentQueueCall(state.queueOverlay);
    } else {
      queueOverlay.hidden = true;
      if (queueOverlayTimer !== undefined) {
        window.clearTimeout(queueOverlayTimer);
        queueOverlayTimer = undefined;
      }
    }
  } catch {
    offline.hidden = false;
  }
}

void refresh();
window.setInterval(() => void refresh(), 450);

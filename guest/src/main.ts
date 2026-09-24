import type { EntertainmentRound, GameManifestV1, PlatformSnapshot } from "@waiting/shared";
import "./style.css";

const API = location.protocol + "//" + location.hostname + ":3001/api/platform";
const root = document.querySelector<HTMLDivElement>("#app")!;
const parts = location.pathname.split("/").filter(Boolean);
const code = (parts.at(-1) || new URLSearchParams(location.search).get("code") || "").trim().toUpperCase();

let snapshot: PlatformSnapshot | null = null;
let round: EntertainmentRound | undefined;
let game: GameManifestV1 | undefined;
let joinedName = "";
let watchTimer: number | undefined;
let redirecting = false;

try {
  joinedName = sessionStorage.getItem("waiting-round:" + code + ":name") || "";
} catch {}

function esc(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function api(path = "", init?: RequestInit) {
  const response = await fetch(API + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "HTTP " + response.status);
  return body;
}

function entryUrl(manifest: GameManifestV1): string {
  const raw = manifest.entrypoints.player.replaceAll("{host}", location.hostname);
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return location.protocol + "//" + location.hostname + raw;
}

function statusText(value: EntertainmentRound["status"]) {
  return {
    recruiting: "报名开放中",
    locked: "报名已锁定",
    running: "本轮已开始",
    finished: "本轮已结束",
    cancelled: "本轮已取消",
    expired: "二维码已过期",
  }[value];
}

function render() {
  if (!code) {
    root.innerHTML = '<main class="guest-shell"><section class="join-card error-card"><span class="eyebrow">INVALID ROUND</span><h1>没有找到本轮二维码</h1><p>请重新扫描现场大屏上的动态二维码。</p></section></main>';
    return;
  }

  if (!snapshot) {
    root.innerHTML = '<main class="guest-shell"><section class="join-card loading-card"><div class="pulse"></div><strong>正在读取本轮信息…</strong></section></main>';
    return;
  }

  if (!round || !game) {
    root.innerHTML = '<main class="guest-shell"><section class="join-card error-card"><span class="eyebrow">ROUND ' + esc(code) + '</span><h1>本轮已失效</h1><p>每一轮都会生成新的二维码，请以大屏当前显示为准。</p></section></main>';
    return;
  }

  const open =
    !joinedName &&
    round.status === "recruiting" &&
    round.players.length < round.playerLimit;
  const names = round.players.map((player) => '<span>' + esc(player.name) + '</span>').join("");
  const joinedState = joinedName
    ? '<div class="closed joined-wait"><strong>' +
      (round.status === "running"
        ? "主持人已开局 · 正在进入游戏"
        : game?.runtime.kind === "process" && round.status === "locked"
          ? "阵容已锁定 · 正在进入发车区"
          : "报名成功 · 已锁定席位") +
      '</strong><span>' +
      (round.status === "running"
        ? "正在连接本轮游戏运行时…"
        : game?.runtime.kind === "process" && round.status === "locked"
          ? "先进入游戏等候区，主持人开局后统一发车。"
          : "保持此页面打开，主持人开局后会自动进入游戏。") +
      '</span></div>'
    : "";
  root.innerHTML =
    '<main class="guest-shell"><section class="join-card">' +
      '<div class="brand"><span>WE</span><strong>WAITING ENTERTAINMENT</strong></div>' +
      '<span class="eyebrow">ROUND ' + esc(round.code) + ' · ' + statusText(round.status) + '</span>' +
      '<h1>' + esc(game.name) + '</h1><p class="summary">' + esc(game.summary) + '</p>' +
      '<div class="capacity"><strong>' + round.players.length + ' / ' + round.playerLimit + '</strong><span>已报名</span></div>' +
      '<div class="joined-names">' + (names || '<span class="muted">等你加入第一席</span>') + '</div>' +
      (joinedName
        ? joinedState
        : open
          ? '<form id="join-form"><label><span>你的昵称</span><input name="name" maxlength="24" autocomplete="nickname" placeholder="输入现场昵称" required /></label>' +
            '<button type="submit">报名本轮</button><small>不需要登录，也不需要绑定等位号码</small></form>'
          : '<div class="closed"><strong>' + statusText(round.status) + '</strong><span>请等待主持人开放下一轮。</span></div>') +
      '<div id="message" class="message" aria-live="polite"></div>' +
    '</section></main>';

  document.querySelector<HTMLFormElement>("#join-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const name = String(form.get("name") ?? "").trim().slice(0, 24);
    if (!name) return;
    void join(name);
  });
}

async function join(name: string) {
  const message = document.querySelector<HTMLDivElement>("#message");
  const button = document.querySelector<HTMLButtonElement>("#join-form button");
  if (button) button.disabled = true;
  if (message) message.textContent = "正在锁定本轮席位…";

  try {
    const payload = await api("/join/" + encodeURIComponent(code), {
      method: "POST",
      body: JSON.stringify({ name }),
    }) as { round: EntertainmentRound };

    round = payload.round;
    if (!game) throw new Error("game-not-found");
    joinedName = name;
    try {
      sessionStorage.setItem("waiting-round:" + code + ":name", joinedName);
    } catch {}

    if (message) {
      message.classList.add("message--ok");
      message.textContent = "报名成功 · 等待主持人开局";
    }

    render();
    startRoundWatch();
  } catch (error) {
    if (button) button.disabled = false;
    if (message) {
      message.classList.remove("message--ok");
      const reason = error instanceof Error ? error.message : "join-failed";
      message.textContent =
        reason === "round-full"
          ? "本轮名额已满"
          : reason === "round-not-recruiting"
            ? "本轮已经停止报名"
            : "报名失败，请重新扫描大屏二维码";
    }
  }
}

function launchGameIfReady() {
  // Embedded games do not need a child runtime warm-up. Once the guest has
  // registered, send them straight to the controller so the scan -> control
  // flow matches the mature game packages. The controller itself waits for
  // the hosted round to start before opening its socket.
  const embeddedControllerReady =
    game?.runtime.kind === "embedded" &&
    round?.status === "recruiting";
  const processLobbyReady =
    game?.runtime.kind === "process" &&
    round?.status === "locked";
  const gameReady =
    round?.status === "running" ||
    processLobbyReady ||
    embeddedControllerReady;

  if (
    redirecting ||
    !joinedName ||
    !round ||
    !game ||
    !gameReady
  ) {
    return;
  }

  redirecting = true;
  const target = new URL(entryUrl(game));
  target.searchParams.set("round", code);
  target.searchParams.set("name", joinedName);
  target.searchParams.set("hub", "1");
  location.replace(target.toString());
}

function startRoundWatch() {
  if (watchTimer !== undefined) return;
  watchTimer = window.setInterval(() => void refresh(true), 500);
}

async function refresh(fromWatch = false) {
  try {
    snapshot = (await api()) as PlatformSnapshot;
    round = snapshot.rounds.find((item) => item.code === code);
    game = round ? snapshot.games.find((item) => item.id === round?.gameId) : undefined;
    render();
    launchGameIfReady();

    if (
      fromWatch &&
      round &&
      ["finished", "cancelled", "expired"].includes(round.status) &&
      watchTimer !== undefined
    ) {
      window.clearInterval(watchTimer);
      watchTimer = undefined;
    }
  } catch {
    root.innerHTML = '<main class="guest-shell"><section class="join-card error-card"><h1>暂时连接不到现场主机</h1><p>请确认手机与餐厅大屏在同一 Wi-Fi 后重试。</p></section></main>';
  }
}

render();
void refresh().then(() => {
  if (joinedName) startRoundWatch();
});

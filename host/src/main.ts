import type { EntertainmentRound, GameManifestV1, GameRuntimeStatus, PlatformSnapshot, QueueTicket } from "@waiting/shared";
import "./style.css";

const API = location.protocol + "//" + location.hostname + ":3001/api/platform";
const root = document.querySelector<HTMLDivElement>("#app")!;
let snapshot: PlatformSnapshot | null = null;
let busy = false;

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function currentRound(rounds: EntertainmentRound[]) {
  return rounds.find((round) => ["recruiting", "locked", "running"].includes(round.status));
}

function roundLabel(status: EntertainmentRound["status"]) {
  return {
    recruiting: "报名中",
    locked: "已锁定",
    running: "进行中",
    finished: "已结束",
    cancelled: "已取消",
    expired: "已过期",
  }[status];
}

function queueLabel(status: QueueTicket["status"]) {
  return {
    waiting: "等位中",
    called: "已叫号",
    passed: "已过号",
    seated: "已入座",
    cancelled: "已取消",
  }[status];
}

function roundActions(round: EntertainmentRound): string {
  if (round.status === "recruiting") {
    return '<button class="secondary" data-round-action="lock" data-round-id="' + round.id + '">锁定报名</button>' +
      '<button class="ghost danger-text" data-round-action="cancel" data-round-id="' + round.id + '">取消本轮</button>';
  }
  if (round.status === "locked") {
    return '<button class="primary" data-round-action="start" data-round-id="' + round.id + '">主持人开局</button>' +
      '<button class="secondary" data-round-action="reopen" data-round-id="' + round.id + '">重新开放</button>' +
      '<button class="ghost danger-text" data-round-action="cancel" data-round-id="' + round.id + '">取消本轮</button>';
  }
  if (round.status === "running") {
    return '<button class="danger" data-round-action="finish" data-round-id="' + round.id + '">结束本轮</button>';
  }
  return "";
}

function renderRound(round: EntertainmentRound | undefined, games: GameManifestV1[]): string {
  if (!round) {
    return '<section class="empty-stage"><span class="eyebrow">LIVE ROUND</span><h2>当前没有开放的互动场次</h2>' +
      '<p>从下方游戏库选择一个游戏。主持人开放报名后，大屏会自动进入招募状态。</p></section>';
  }

  const game = games.find((item) => item.id === round.gameId);
  const seats = Array.from({ length: round.playerLimit }, (_, index) => round.players[index]);
  const seatHtml = seats.map((player, index) =>
    '<div class="player-slot ' + (player ? "player-slot--filled" : "") + '">' +
      '<span>' + String(index + 1).padStart(2, "0") + '</span>' +
      '<strong>' + (player ? esc(player.name) : "等待报名") + '</strong></div>'
  ).join("");

  return '<section class="round-card round-card--' + round.status + '">' +
    '<div class="round-heading"><div><span class="eyebrow">CURRENT ROUND · ' + roundLabel(round.status) + '</span>' +
    '<h2>' + esc(game?.name ?? round.gameId) + '</h2></div>' +
    '<div class="round-code"><small>本轮动态码</small><strong>' + esc(round.code) + '</strong></div></div>' +
    '<div class="round-stats">' +
      '<div><strong>' + round.players.length + '</strong><span>/ ' + round.playerLimit + ' 已报名</span></div>' +
      '<div><strong>' + roundLabel(round.status) + '</strong><span>现场状态</span></div>' +
      '<div><strong>' + esc(snapshot?.broadcast.mode ?? "—") + '</strong><span>大屏状态</span></div>' +
    '</div><div class="player-grid">' + seatHtml + '</div>' +
    '<div class="actions">' + roundActions(round) + '</div></section>';
}

function runtimeText(runtime: GameRuntimeStatus | undefined): string {
  if (!runtime) return "运行状态未知";
  return {
    embedded: "内置运行时",
    "not-configured": "未配置本地游戏目录",
    stopped: "本地游戏已就绪",
    starting: "正在启动游戏",
    running: "游戏进程运行中",
    unhealthy: "游戏进程异常",
    failed: "游戏启动失败",
  }[runtime.state];
}

function gameCard(
  game: GameManifestV1,
  runtime: GameRuntimeStatus | undefined,
  active?: EntertainmentRound,
): string {
  const unavailable = game.runtime.kind === "process" && !runtime?.configured;
  const contentDisabled = snapshot?.content.disabledGameIds.includes(game.id) ?? false;
  const disabled = Boolean(active) || unavailable || contentDisabled;
  const buttonText = active
    ? "已有活动场次"
    : contentDisabled
      ? "门店已隐藏"
      : unavailable
        ? "未配置游戏目录"
        : "开放本轮报名";
  const runtimeClass =
    runtime?.state === "failed" || runtime?.state === "unhealthy"
      ? "runtime-badge runtime-badge--error"
      : runtime?.state === "running" || runtime?.state === "embedded"
        ? "runtime-badge runtime-badge--online"
        : "runtime-badge";

  return '<article class="game-card">' +
    '<div class="game-card__top"><span class="game-type">' + esc(game.category) + '</span>' +
    '<span class="tier tier--' + game.commercial.tier + '">' + game.commercial.tier.toUpperCase() + '</span></div>' +
    '<h3>' + esc(game.name) + '</h3><p>' + esc(game.summary) + '</p>' +
    '<div class="game-meta"><span>' + game.players.min + '–' + game.players.max + ' 人</span>' +
    '<span>' + (game.capabilities.aiFill ? "AI 补位" : "真人局") + '</span>' +
    '<span>' + (game.capabilities.highlights ? "精彩导播" : "基础导播") + '</span></div>' +
    '<div class="' + runtimeClass + '">' + esc(runtimeText(runtime)) + '</div>' +
    (runtime?.message ? '<div class="runtime-message">' + esc(runtime.message) + '</div>' : '') +
    '<button class="primary" data-create-game="' + esc(game.id) + '" ' + (disabled ? "disabled" : "") + '>' + buttonText + '</button>' +
    '</article>';
}

function contentGameRows(games: GameManifestV1[]): string {
  if (!snapshot) return "";
  const disabled = new Set(snapshot.content.disabledGameIds);
  return games.map((game, index) => {
    const enabled = !disabled.has(game.id);
    return '<div class="content-row">' +
      '<div class="content-order">' + String(index + 1).padStart(2, "0") + '</div>' +
      '<div class="content-copy"><strong>' + esc(game.name) + '</strong><span>' +
        (enabled ? "已在门店游戏库启用" : "已隐藏，不影响授权") + '</span></div>' +
      '<div class="content-actions">' +
        '<button class="ghost small-action" data-content-game-action="up" data-game-id="' + esc(game.id) + '">↑</button>' +
        '<button class="ghost small-action" data-content-game-action="down" data-game-id="' + esc(game.id) + '">↓</button>' +
        '<button class="' + (enabled ? "secondary" : "primary") + ' small-action" data-content-game-action="' +
          (enabled ? "disable" : "enable") + '" data-game-id="' + esc(game.id) + '">' +
          (enabled ? "隐藏" : "启用") + '</button>' +
      '</div></div>';
  }).join("");
}

function mediaRows(): string {
  if (!snapshot) return "";
  return snapshot.content.media.map((item, index) =>
    '<div class="content-row media-row">' +
      '<div class="content-order">' + String(index + 1).padStart(2, "0") + '</div>' +
      '<div class="content-copy"><strong>' + esc(item.title) + '</strong><span>' +
        esc(item.kind.toUpperCase()) + ' · ' + item.durationSeconds + 's · ' +
        (item.enabled ? "大屏轮播中" : "已停用") + '</span>' +
        (item.source ? '<small>' + esc(item.source) + '</small>' : '') +
      '</div><div class="content-actions">' +
        '<button class="ghost small-action" data-media-action="up" data-media-id="' + item.id + '">↑</button>' +
        '<button class="ghost small-action" data-media-action="down" data-media-id="' + item.id + '">↓</button>' +
        '<button class="' + (item.enabled ? "secondary" : "primary") + ' small-action" data-media-action="' +
          (item.enabled ? "disable" : "enable") + '" data-media-id="' + item.id + '">' +
          (item.enabled ? "停用" : "启用") + '</button>' +
        (item.id === "system-welcome"
          ? ""
          : '<button class="ghost danger-text small-action" data-media-action="delete" data-media-id="' + item.id + '">删除</button>') +
      '</div></div>'
  ).join("");
}

function renderContentManager(games: GameManifestV1[]): string {
  return '<section class="section-block content-manager">' +
    '<div class="section-title"><div><span class="eyebrow">CONTENT MANAGEMENT</span><h2>游戏与媒体内容管理</h2></div>' +
    '<span class="section-note">授权决定“能不能用”，这里决定“门店展示什么”</span></div>' +
    '<div class="content-grid"><div><h3 class="content-subtitle">游戏上架与顺序</h3><div class="content-list">' +
      contentGameRows(games) + '</div></div>' +
    '<div><h3 class="content-subtitle">大屏候场媒体库</h3>' +
      '<form id="media-form" class="media-form">' +
        '<select name="kind"><option value="message">文字</option><option value="image">图片 URL</option><option value="video">视频 URL</option></select>' +
        '<input name="title" maxlength="60" placeholder="素材名称" />' +
        '<input name="source" maxlength="500" placeholder="图片/视频 URL；文字可留空" />' +
        '<input name="headline" maxlength="80" placeholder="大屏主标题" />' +
        '<input name="subline" maxlength="140" placeholder="副标题" />' +
        '<input name="durationSeconds" type="number" min="3" max="120" value="10" title="轮播秒数" />' +
        '<button class="primary" type="submit">添加素材</button>' +
      '</form><div class="content-list media-list">' + mediaRows() + '</div></div></div>' +
    '</section>';
}

function queueRow(ticket: QueueTicket): string {
  let actions = "";
  if (ticket.status === "waiting") {
    actions = '<button data-queue-action="call" data-ticket-id="' + ticket.id + '">叫号</button>' +
      '<button class="ghost" data-queue-action="cancel" data-ticket-id="' + ticket.id + '">取消</button>';
  } else if (ticket.status === "called") {
    actions = '<button data-queue-action="seat" data-ticket-id="' + ticket.id + '">入座</button>' +
      '<button class="secondary" data-queue-action="pass" data-ticket-id="' + ticket.id + '">过号</button>' +
      '<button class="ghost" data-queue-action="return" data-ticket-id="' + ticket.id + '">撤回</button>';
  } else if (ticket.status === "passed") {
    actions = '<button data-queue-action="call" data-ticket-id="' + ticket.id + '">再次叫号</button>' +
      '<button class="ghost" data-queue-action="cancel" data-ticket-id="' + ticket.id + '">取消</button>';
  }

  return '<div class="queue-row queue-row--' + ticket.status + '">' +
    '<div class="ticket-no">' + esc(ticket.number) + '</div>' +
    '<div class="ticket-info"><strong>' + ticket.partySize + ' 人' + (ticket.label ? " · " + esc(ticket.label) : "") + '</strong>' +
    '<span>' + queueLabel(ticket.status) + '</span></div><div class="queue-actions">' + actions + '</div></div>';
}

function render() {
  if (!snapshot) {
    root.innerHTML = '<main class="boot"><div class="pulse"></div><strong>连接 Waiting Entertainment Hub…</strong></main>';
    return;
  }

  const active = currentRound(snapshot.rounds);
  const queue = snapshot.queue.filter((ticket) => ticket.status !== "cancelled");
  const waitingCount = queue.filter((ticket) => ticket.status === "waiting").length;
  const screenUrl = location.protocol + "//" + location.hostname + ":5176";

  root.innerHTML =
    '<main class="shell"><header class="topbar"><div class="brand"><span class="brand-mark">WE</span><div>' +
    '<span class="eyebrow">WAITING ENTERTAINMENT HUB</span><h1>现场主持控制台</h1></div></div>' +
    '<div class="topbar-actions"><span class="live-dot">LOCAL HOST ONLINE</span>' +
    '<span class="plan">' + esc(snapshot.license.plan) + ' · ' + esc(snapshot.license.storeId) + '</span>' +
    '<a class="screen-link" href="' + screenUrl + '" target="_blank">打开大屏主控 ↗</a></div></header>' +
    '<div class="workspace"><section class="main-column">' + renderRound(active, snapshot.games) +
    '<section class="section-block"><div class="section-title"><div><span class="eyebrow">GAME LIBRARY</span><h2>互动游戏库</h2></div>' +
    '<span class="section-note">授权内容由门店 Entitlements 决定</span></div><div class="game-grid">' +
    snapshot.games.map((game) =>
      gameCard(
        game,
        snapshot?.runtimes.find((runtime) => runtime.gameId === game.id),
        active,
      ),
    ).join("") + '</div></section>' + renderContentManager(snapshot.games) + '</section>' +
    '<aside class="side-column"><section class="queue-panel"><div class="section-title compact"><div>' +
    '<span class="eyebrow">RESTAURANT QUEUE</span><h2>等位叫号</h2></div><span class="queue-count">' + waitingCount + ' 桌等待</span></div>' +
    '<form id="queue-form" class="queue-form"><label><span>人数</span><input name="partySize" type="number" min="1" max="30" value="2" required /></label>' +
    '<label class="grow"><span>备注</span><input name="label" maxlength="40" placeholder="如：靠窗 / 王先生" /></label>' +
    '<button class="primary" type="submit">新增等位</button></form><div class="queue-list">' +
    (queue.length ? queue.map(queueRow).join("") : '<div class="queue-empty">暂无等位客人</div>') +
    '</div></section><section class="broadcast-status"><span class="eyebrow">BROADCAST</span>' +
    '<div class="broadcast-mode">' + esc(snapshot.broadcast.mode) + '</div><p>' +
    (snapshot.broadcast.queueOverlay ? '正在叫号：<strong>' + esc(snapshot.broadcast.queueOverlay.number) + '</strong>' : "游戏画面与叫号 Overlay 独立合成") +
    '</p></section></aside></div><div id="toast" class="toast" aria-live="polite"></div></main>';

  bindEvents();
}

function toast(message: string, error = false) {
  const node = document.querySelector<HTMLDivElement>("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("toast--error", error);
  node.classList.add("toast--show");
  window.setTimeout(() => node.classList.remove("toast--show"), 2200);
}

async function mutate(path: string, body?: unknown) {
  if (busy) return;
  busy = true;
  try {
    await api(path, { method: "POST", body: JSON.stringify(body ?? {}) });
    await refresh(true);
  } catch (error) {
    toast(error instanceof Error ? error.message : "操作失败", true);
  } finally {
    busy = false;
  }
}

function bindEvents() {
  document.querySelectorAll<HTMLButtonElement>("[data-create-game]").forEach((button) => {
    button.addEventListener("click", () => void mutate("/rounds", { gameId: button.dataset.createGame }));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-round-action]").forEach((button) => {
    button.addEventListener("click", () => void mutate("/rounds/" + button.dataset.roundId + "/" + button.dataset.roundAction));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-queue-action]").forEach((button) => {
    button.addEventListener("click", () => void mutate("/queue/" + button.dataset.ticketId + "/" + button.dataset.queueAction));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-content-game-action]").forEach((button) => {
    button.addEventListener("click", () => {
      void mutate(
        "/content/games/" + button.dataset.gameId + "/" + button.dataset.contentGameAction,
      );
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-media-action]").forEach((button) => {
    button.addEventListener("click", () => {
      void mutate(
        "/content/media/" + button.dataset.mediaId + "/" + button.dataset.mediaAction,
      );
    });
  });

  document.querySelector<HTMLFormElement>("#media-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    void mutate("/content/media", {
      kind: String(form.get("kind") ?? "message"),
      title: String(form.get("title") ?? ""),
      source: String(form.get("source") ?? ""),
      headline: String(form.get("headline") ?? ""),
      subline: String(form.get("subline") ?? ""),
      durationSeconds: Number(form.get("durationSeconds")),
    });
  });

  document.querySelector<HTMLFormElement>("#queue-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    void mutate("/queue", {
      partySize: Number(form.get("partySize")),
      label: String(form.get("label") ?? ""),
    });
  });
}

async function refresh(force = false) {
  if (busy && !force) return;
  try {
    const next = (await api()) as PlatformSnapshot;
    const changed = JSON.stringify(next) !== JSON.stringify(snapshot);
    snapshot = next;
    if (force || changed) render();
  } catch {
    if (!snapshot) {
      root.innerHTML = '<main class="boot boot--error"><strong>无法连接本地主机 :3001</strong><span>请确认 server 已启动。</span></main>';
    }
  }
}

render();
void refresh(true);
window.setInterval(() => void refresh(), 800);

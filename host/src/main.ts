import type { EntertainmentRound, GameManifestV1, GameRuntimeStatus, GameSettingV1, GameSettingsResponse, PlatformSnapshot, QueueTicket } from "@waiting/shared";
import "./style.css";

const API = location.protocol + "//" + location.hostname + ":3001/api/platform";
const root = document.querySelector<HTMLDivElement>("#app")!;
let snapshot: PlatformSnapshot | null = null;
let busy = false;
let activeView: "live" | "games" = location.hash === "#games" ? "games" : "live";
const runtimeLogText = new Map<string, string>();
const settingsState = new Map<string, GameSettingsResponse>();
const settingsRequested = new Set<string>();
// 草稿：已编辑但未保存的值按 game/key 暂存，跨重渲染保留输入，
// 保存/恢复成功后清除（此时服务端状态成为唯一事实源）。
const settingsDrafts = new Map<string, Record<string, string | number | boolean>>();

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
  const runtime = game
    ? snapshot?.runtimes.find((item) => item.gameId === game.id)
    : undefined;
  const runtimeDegraded =
    round.status === "running" &&
    game?.runtime.kind === "process" &&
    runtime?.state !== "running";
  const seats = Array.from({ length: round.playerLimit }, (_, index) => round.players[index]);
  const seatHtml = seats.map((player, index) =>
    '<div class="player-slot ' + (player ? "player-slot--filled" : "") + '">' +
      '<span>' + String(index + 1).padStart(2, "0") + '</span>' +
      '<strong>' + (player ? esc(player.name) : "等待报名") + '</strong></div>'
  ).join("");

  const runtimeWarning = runtimeDegraded
    ? '<div class="round-runtime-alert"><div><span>RUNTIME DEGRADED</span><strong>' +
        esc(runtimeText(runtime)) + '</strong><small>' +
        esc(runtime?.message || "外部游戏进程未通过健康检查。比赛不会自动结束，请主持人确认。") +
      '</small></div><div class="round-runtime-actions">' +
        '<button class="secondary" data-runtime-check="' + esc(round.gameId) + '">重新检查</button>' +
        '<button class="ghost" data-runtime-logs="' + esc(round.gameId) + '">查看日志</button>' +
      '</div></div>'
    : '';

  return '<section class="round-card round-card--' + round.status +
      (runtimeDegraded ? ' round-card--degraded' : '') + '">' +
    '<div class="round-heading"><div><span class="eyebrow">CURRENT ROUND · ' + roundLabel(round.status) + '</span>' +
    '<h2>' + esc(game?.name ?? round.gameId) + '</h2></div>' +
    '<div class="round-code"><small>本轮动态码</small><strong>' + esc(round.code) + '</strong></div></div>' +
    '<div class="round-stats">' +
      '<div><strong>' + round.players.length + '</strong><span>/ ' + round.playerLimit + ' 已报名</span></div>' +
      '<div><strong>' + roundLabel(round.status) + '</strong><span>现场状态</span></div>' +
      '<div><strong>' + esc(snapshot?.broadcast.mode ?? "—") + '</strong><span>大屏状态</span></div>' +
    '</div>' + runtimeWarning + '<div class="player-grid">' + seatHtml + '</div>' +
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
  const disabled = Boolean(active) || unavailable;
  const buttonText = active
    ? "已有活动场次"
    : unavailable
      ? "未配置游戏目录"
      : "开放本轮报名";
  const runtimeClass =
    runtime?.state === "failed" || runtime?.state === "unhealthy"
      ? "runtime-badge runtime-badge--error"
      : runtime?.state === "running" || runtime?.state === "embedded"
        ? "runtime-badge runtime-badge--online"
        : "runtime-badge";

  const runtimeTools = game.runtime.kind === "process"
    ? '<div class="runtime-tools">' +
        '<button class="secondary" data-runtime-check="' + esc(game.id) + '">检查运行时</button>' +
        '<button class="ghost" data-runtime-logs="' + esc(game.id) + '">查看日志</button>' +
      '</div>'
    : '';
  const runtimeLog = runtimeLogText.get(game.id);

  return '<article class="game-card">' +
    '<div class="game-card__top"><span class="game-type">' + esc(game.category) + '</span>' +
    '<span class="tier tier--' + game.commercial.tier + '">' + game.commercial.tier.toUpperCase() + '</span></div>' +
    '<h3>' + esc(game.name) + '</h3><p>' + esc(game.summary) + '</p>' +
    '<div class="game-meta"><span>' + game.players.min + '–' + game.players.max + ' 人</span>' +
    '<span>' + (game.capabilities.aiFill ? "AI 补位" : "真人局") + '</span>' +
    '<span>' + (game.capabilities.highlights ? "精彩导播" : "基础导播") + '</span></div>' +
    '<div class="' + runtimeClass + '">' + esc(runtimeText(runtime)) + '</div>' +
    (runtime?.message ? '<div class="runtime-message">' + esc(runtime.message) + '</div>' : '') +
    runtimeTools +
    (runtimeLog ? '<pre class="runtime-log">' + esc(runtimeLog) + '</pre>' : '') +
    '<button class="primary" data-create-game="' + esc(game.id) + '" ' + (disabled ? "disabled" : "") + '>' + buttonText + '</button>' +
    '</article>';
}

function entryUrl(game: GameManifestV1, kind: "display" | "player"): string {
  const raw = game.entrypoints[kind].replaceAll("{host}", location.hostname);
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return location.protocol + "//" + location.hostname + raw;
}

function friendlySettingsError(message: string): string {
  if (message.startsWith("settings-invalid-value:")) {
    return "参数值不合法：" + message.split(":")[1];
  }
  if (message.startsWith("settings-unknown-key:")) {
    return "未知参数：" + message.split(":")[1];
  }
  if (message.startsWith("settings-file-invalid")) {
    return "本地参数文件损坏，请点恢复默认";
  }
  return message;
}

function settingsField(
  gameId: string,
  setting: GameSettingV1,
  payload: GameSettingsResponse | undefined,
): string {
  const overridden = payload
    ? Object.prototype.hasOwnProperty.call(payload.overrides, setting.key)
    : false;
  const draft = settingsDrafts.get(gameId)?.[setting.key];
  const value = draft !== undefined
    ? draft
    : (payload?.values[setting.key] ?? setting.default);
  let control = "";
  if (setting.type === "number") {
    control = '<input type="number" data-setting="' + esc(setting.key) + '"' +
      (setting.min !== undefined ? ' min="' + setting.min + '"' : "") +
      (setting.max !== undefined ? ' max="' + setting.max + '"' : "") +
      (setting.step !== undefined ? ' step="' + setting.step + '"' : "") +
      ' value="' + esc(value) + '" />';
  } else if (setting.type === "enum") {
    control = '<select data-setting="' + esc(setting.key) + '">' +
      (setting.options ?? []).map((option) =>
        '<option value="' + esc(option.value) + '"' +
          (String(value) === option.value ? " selected" : "") + '>' +
          esc(option.label) + '</option>'
      ).join("") + '</select>';
  } else if (setting.type === "boolean") {
    control = '<input type="checkbox" data-setting="' + esc(setting.key) + '"' +
      (value ? " checked" : "") + ' />';
  } else {
    control = '<input type="text" maxlength="80" data-setting="' +
      esc(setting.key) + '" value="' + esc(value) + '" />';
  }
  return '<label class="manage-setting manage-setting--field">' +
    '<span>' + esc(setting.label) + '</span>' + control +
    '<code>' + esc(setting.env ?? "package") + '</code>' +
    (overridden ? '<em class="setting-flag">已修改</em>' : '') +
    '</label>';
}

function managementCard(
  game: GameManifestV1,
  runtime: GameRuntimeStatus | undefined,
  active?: EntertainmentRound,
): string {
  const authorized = Boolean(snapshot?.games.some((item) => item.id === game.id));
  const isProcess = game.runtime.kind === "process";
  const activeOwnRound = active?.gameId === game.id &&
    ["recruiting", "locked", "running"].includes(active.status);
  const stopBlocked = activeOwnRound && active?.status !== "recruiting";
  const runtimeClass =
    !authorized ? "manage-state manage-state--locked"
    : runtime?.state === "running" || runtime?.state === "embedded"
      ? "manage-state manage-state--online"
      : runtime?.state === "failed" || runtime?.state === "unhealthy"
        ? "manage-state manage-state--error"
        : "manage-state";
  const source = runtime?.configSource === "environment"
    ? "环境变量"
    : runtime?.configSource === "bundled"
      ? "仓库内置"
      : runtime?.configSource === "embedded"
        ? "Hub 内置"
        : "—";
  const canOpen = authorized &&
    (runtime?.state === "running" || runtime?.state === "embedded");
  const log = runtimeLogText.get(game.id);
  const runtimeActions = isProcess && authorized
    ? '<div class="manage-actions">' +
        (runtime?.state === "running"
          ? '<button class="secondary" data-runtime-stop="' + esc(game.id) + '" ' +
              ((!runtime?.managed || stopBlocked) ? "disabled" : "") + '>' +
              (!runtime?.managed ? "外部进程" : stopBlocked ? "场次运行中" : "停止进程") + '</button>'
          : '<button class="primary" data-runtime-start="' + esc(game.id) + '" ' +
              (!runtime?.configured ? "disabled" : "") + '>启动 / 预热</button>') +
        '<button class="secondary" data-runtime-check="' + esc(game.id) + '">健康检查</button>' +
        '<button class="ghost" data-runtime-logs="' + esc(game.id) + '">日志</button>' +
      '</div>'
    : '';

  return '<article class="manage-card ' + (!authorized ? "manage-card--locked" : "") + '">' +
    '<div class="manage-head"><div><span class="game-type">' + esc(game.category) + '</span>' +
      '<h3>' + esc(game.name) + '</h3></div>' +
      '<div class="manage-version"><span>v' + esc(game.version) + '</span><b>' +
        esc(game.commercial.tier.toUpperCase()) + '</b></div></div>' +
    '<p>' + esc(game.summary) + '</p>' +
    '<div class="' + runtimeClass + '">' +
      '<strong>' + esc(authorized ? runtimeText(runtime) : "当前套餐未授权") + '</strong>' +
      '<span>' + (authorized ? esc(runtime?.message ?? "运行契约正常") : esc(game.commercial.entitlements.join(", "))) + '</span>' +
    '</div>' +
    '<dl class="manage-spec">' +
      '<div><dt>玩家</dt><dd>' + game.players.min + '–' + game.players.max + ' 人</dd></div>' +
      '<div><dt>运行方式</dt><dd>' + esc(game.runtime.kind) + '</dd></div>' +
      '<div><dt>端口</dt><dd>' + esc(runtime?.port ?? game.runtime.port ?? "—") + '</dd></div>' +
      '<div><dt>PID</dt><dd>' + esc(runtime?.pid ?? "—") + '</dd></div>' +
      '<div><dt>配置来源</dt><dd>' + esc(source) + '</dd></div>' +
      '<div><dt>能力</dt><dd>' + [
        game.capabilities.aiFill ? "AI" : "",
        game.capabilities.reconnect ? "重连" : "",
        game.capabilities.highlights ? "导播" : "",
      ].filter(Boolean).join(" · ") + '</dd></div>' +
    '</dl>' +
    (runtime?.workingDirectory
      ? '<div class="manage-path"><span>运行目录</span><code>' + esc(runtime.workingDirectory) + '</code></div>'
      : '') +
    (game.settings?.length
      ? (authorized
          ? '<div class="manage-settings" data-settings-game="' + esc(game.id) + '">' +
              '<span class="manage-settings__title">参数设置 · 修改后保存</span>' +
              game.settings.map((setting) =>
                settingsField(game.id, setting, settingsState.get(game.id))
              ).join("") +
              // 数据未加载前不允许保存：否则表单里的默认值会被当成用户意图，
              // 静默覆盖掉已有的本地修改。
              (settingsState.has(game.id)
                ? '<div class="manage-setting-actions">' +
                    '<button class="primary" data-settings-save="' + esc(game.id) + '">保存</button>' +
                    '<button class="secondary" data-settings-reset="' + esc(game.id) + '">恢复默认</button>' +
                    (runtime?.state === "running"
                      ? '<span class="manage-settings__hint">进程运行中 · 修改下次启动生效</span>'
                      : '') +
                  '</div>'
                : '<div class="manage-setting-actions">' +
                    '<span class="manage-settings__hint">参数加载中…</span>' +
                  '</div>') +
            '</div>'
          : '<div class="manage-settings"><span class="manage-settings__title">默认参数 · 下次启动生效</span>' +
              game.settings.map((setting) =>
                '<div class="manage-setting"><span>' + esc(setting.label) + '</span><strong>' +
                  esc(
                    setting.type === "enum"
                      ? (setting.options?.find((option) => option.value === String(setting.default))?.label ?? setting.default)
                      : setting.default,
                  ) +
                  '</strong><code>' + esc(setting.env ?? "package") + '</code></div>'
              ).join("") +
            '</div>')
      : '') +
    runtimeActions +
    '<div class="manage-links">' +
      (canOpen
        ? '<a href="' + esc(entryUrl(game, "display")) + '" target="_blank">打开大屏 ↗</a>' +
          '<a href="' + esc(entryUrl(game, "player")) + '" target="_blank">打开玩家端 ↗</a>'
        : '<span>运行后开放预览入口</span>') +
    '</div>' +
    (log ? '<pre class="runtime-log manage-log">' + esc(log) + '</pre>' : '') +
  '</article>';
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
  const liveWorkspace =
    '<div class="workspace"><section class="main-column">' + renderRound(active, snapshot.games) +
    '<section class="section-block"><div class="section-title"><div><span class="eyebrow">GAME LIBRARY</span><h2>互动游戏库</h2></div>' +
    '<span class="section-note">场次从已授权游戏中创建</span></div><div class="game-grid">' +
    snapshot.games.map((game) =>
      gameCard(
        game,
        snapshot?.runtimes.find((runtime) => runtime.gameId === game.id),
        active,
      ),
    ).join("") + '</div></section></section>' +
    '<aside class="side-column"><section class="queue-panel"><div class="section-title compact"><div>' +
    '<span class="eyebrow">RESTAURANT QUEUE</span><h2>等位叫号</h2></div><span class="queue-count">' + waitingCount + ' 桌等待</span></div>' +
    '<form id="queue-form" class="queue-form"><label><span>人数</span><input name="partySize" type="number" min="1" max="30" value="2" required /></label>' +
    '<label class="grow"><span>备注</span><input name="label" maxlength="40" placeholder="如：靠窗 / 王先生" /></label>' +
    '<button class="primary" type="submit">新增等位</button></form><div class="queue-list">' +
    (queue.length ? queue.map(queueRow).join("") : '<div class="queue-empty">暂无等位客人</div>') +
    '</div></section><section class="broadcast-status"><span class="eyebrow">BROADCAST</span>' +
    '<div class="broadcast-mode">' + esc(snapshot.broadcast.mode) + '</div><p>' +
    (snapshot.broadcast.queueOverlay
      ? '正在叫号：<strong>' + esc(snapshot.broadcast.queueOverlay.number) + '</strong>'
      : "游戏画面与叫号 Overlay 独立合成") +
    '</p></section></aside></div>';

  const allGames = snapshot.allGames ?? snapshot.games;
  const onlineCount = snapshot.runtimes.filter((runtime) =>
    runtime.state === "running" || runtime.state === "embedded",
  ).length;
  const managementWorkspace =
    '<section class="management"><div class="management-hero"><div><span class="eyebrow">GAME MANAGEMENT</span>' +
      '<h2>游戏管理中心</h2><p>统一管理 Game Package、授权、运行时、端口健康与本地进程。</p></div>' +
      '<div class="management-summary"><div><strong>' + allGames.length + '</strong><span>游戏包</span></div>' +
      '<div><strong>' + snapshot.games.length + '</strong><span>已授权</span></div>' +
      '<div><strong>' + onlineCount + '</strong><span>在线运行时</span></div></div></div>' +
    '<div class="manage-grid">' +
      allGames.map((game) =>
        managementCard(
          game,
          snapshot?.runtimes.find((runtime) => runtime.gameId === game.id),
          active,
        ),
      ).join("") +
    '</div></section>';

  root.innerHTML =
    '<main class="shell"><header class="topbar"><div class="brand"><span class="brand-mark">WE</span><div>' +
    '<span class="eyebrow">WAITING ENTERTAINMENT HUB</span><h1>门店娱乐运营台</h1></div></div>' +
    '<nav class="console-tabs"><button data-view="live" class="' + (activeView === "live" ? "active" : "") + '">现场控制</button>' +
    '<button data-view="games" class="' + (activeView === "games" ? "active" : "") + '">游戏管理</button></nav>' +
    '<div class="topbar-actions"><span class="live-dot">LOCAL HOST ONLINE</span>' +
    '<span class="plan">' + esc(snapshot.license.plan) + ' · ' + esc(snapshot.license.storeId) + '</span>' +
    '<a class="screen-link" href="' + screenUrl + '" target="_blank">打开大屏主控 ↗</a></div></header>' +
    (activeView === "live" ? liveWorkspace : managementWorkspace) +
    '<div id="toast" class="toast" aria-live="polite"></div></main>';

  bindEvents();
  if (activeView === "games") void loadSettings();
}

function toast(message: string, error = false) {
  const node = document.querySelector<HTMLDivElement>("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("toast--error", error);
  node.classList.add("toast--show");
  window.setTimeout(() => node.classList.remove("toast--show"), 2200);
}

async function checkRuntime(gameId: string) {
  try {
    const body = await api("/runtimes/" + encodeURIComponent(gameId) + "/check", {
      method: "POST",
      body: "{}",
    }) as { runtime: GameRuntimeStatus };
    if (snapshot) {
      const next = snapshot.runtimes.filter((runtime) => runtime.gameId !== gameId);
      next.push(body.runtime);
      snapshot = { ...snapshot, runtimes: next };
      render();
    }
    toast(runtimeText(body.runtime));
  } catch (error) {
    toast(error instanceof Error ? error.message : "运行时检查失败", true);
  }
}

async function showRuntimeLogs(gameId: string) {
  try {
    const body = await api("/runtimes/" + encodeURIComponent(gameId) + "/logs") as {
      runtime: GameRuntimeStatus;
      logs: string[];
    };
    runtimeLogText.set(
      gameId,
      body.logs.length
        ? body.logs.slice(-8).join("\n")
        : "暂无运行日志。运行时尚未由 Hub 启动，或当前没有输出。",
    );
    if (snapshot) {
      const next = snapshot.runtimes.filter((runtime) => runtime.gameId !== gameId);
      next.push(body.runtime);
      snapshot = { ...snapshot, runtimes: next };
    }
    render();
  } catch (error) {
    toast(error instanceof Error ? error.message : "读取运行日志失败", true);
  }
}

async function controlRuntime(gameId: string, action: "start" | "stop") {
  if (busy) return;
  busy = true;
  try {
    const body = await api(
      "/runtimes/" + encodeURIComponent(gameId) + "/" + action,
      { method: "POST", body: "{}" },
    ) as { runtime: GameRuntimeStatus };
    if (snapshot) {
      const next = snapshot.runtimes.filter((runtime) => runtime.gameId !== gameId);
      next.push(body.runtime);
      snapshot = { ...snapshot, runtimes: next };
    }
    await refresh(true);
    toast(action === "start" ? "游戏运行时已启动" : "游戏运行时已停止");
  } catch (error) {
    toast(error instanceof Error ? error.message : "运行时操作失败", true);
  } finally {
    busy = false;
  }
}

async function loadSettings() {
  if (!snapshot) return;
  const games = (snapshot.allGames ?? snapshot.games).filter((game) => game.settings?.length);
  const pending = games.filter((game) => !settingsRequested.has(game.id));
  if (!pending.length) return;
  pending.forEach((game) => settingsRequested.add(game.id));
  let loaded = false;
  for (const game of pending) {
    try {
      const body = await api(
        "/games/" + encodeURIComponent(game.id) + "/settings",
      ) as GameSettingsResponse;
      settingsState.set(game.id, body);
      loaded = true;
    } catch {
      settingsRequested.delete(game.id);
    }
  }
  if (loaded) render();
}

function settingsBusy(): boolean {
  // 输入焦点在参数区内时不自动重渲染，避免输入框被重建丢焦点；
  // 未保存的输入由 settingsDrafts 保留，保存其他卡片的强制渲染也不会丢值。
  const active = document.activeElement;
  return Boolean(active instanceof Element && active.closest(".manage-settings"));
}

async function saveSettings(gameId: string) {
  if (busy) return;
  const container = document.querySelector<HTMLElement>(
    '.manage-settings[data-settings-game="' + CSS.escape(gameId) + '"]',
  );
  if (!container) return;
  const values: Record<string, string | number | boolean> = {};
  container.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) => {
    const key = input.dataset.setting;
    if (!key) return;
    if (input.type === "checkbox") values[key] = input.checked;
    else if (input.type === "number") values[key] = Number(input.value);
    else values[key] = input.value;
  });
  busy = true;
  try {
    const body = await api(
      "/games/" + encodeURIComponent(gameId) + "/settings",
      { method: "PUT", body: JSON.stringify(values) },
    ) as GameSettingsResponse;
    settingsState.set(gameId, body);
    settingsDrafts.delete(gameId);
    toast(body.restartRequired ? "参数已保存 · 下次启动生效" : "参数已保存");
    await refresh(true);
  } catch (error) {
    toast(
      friendlySettingsError(error instanceof Error ? error.message : "保存参数失败"),
      true,
    );
  } finally {
    busy = false;
  }
}

async function resetSettings(gameId: string) {
  if (busy) return;
  busy = true;
  try {
    const body = await api(
      "/games/" + encodeURIComponent(gameId) + "/settings/reset",
      { method: "POST", body: "{}" },
    ) as GameSettingsResponse;
    settingsState.set(gameId, body);
    settingsDrafts.delete(gameId);
    toast(body.restartRequired ? "已恢复默认 · 下次启动生效" : "已恢复默认参数");
    await refresh(true);
  } catch (error) {
    toast(
      friendlySettingsError(error instanceof Error ? error.message : "恢复默认失败"),
      true,
    );
  } finally {
    busy = false;
  }
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
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view === "games" ? "games" : "live";
      if (view === activeView) return;
      activeView = view;
      if (view === "games") {
        settingsRequested.clear();
      } else {
        settingsDrafts.clear();
      }
      history.replaceState(null, "", view === "games" ? "#games" : location.pathname);
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-runtime-start]").forEach((button) => {
    button.addEventListener("click", () => {
      const gameId = button.dataset.runtimeStart;
      if (gameId) void controlRuntime(gameId, "start");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-runtime-stop]").forEach((button) => {
    button.addEventListener("click", () => {
      const gameId = button.dataset.runtimeStop;
      if (gameId) void controlRuntime(gameId, "stop");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-create-game]").forEach((button) => {
    button.addEventListener("click", () => void mutate("/rounds", { gameId: button.dataset.createGame }));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-runtime-check]").forEach((button) => {
    button.addEventListener("click", () => {
      const gameId = button.dataset.runtimeCheck;
      if (gameId) void checkRuntime(gameId);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-runtime-logs]").forEach((button) => {
    button.addEventListener("click", () => {
      const gameId = button.dataset.runtimeLogs;
      if (gameId) void showRuntimeLogs(gameId);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-settings-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const gameId = button.dataset.settingsSave;
      if (gameId) void saveSettings(gameId);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-settings-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      const gameId = button.dataset.settingsReset;
      if (gameId) void resetSettings(gameId);
    });
  });
  document.querySelectorAll<HTMLInputElement>(".manage-settings [data-setting]").forEach((control) => {
    control.addEventListener("input", () => {
      const key = control.dataset.setting;
      const gameId = control.closest<HTMLElement>(".manage-settings")?.dataset.settingsGame;
      if (!key || !gameId) return;
      const draft = settingsDrafts.get(gameId) ?? {};
      draft[key] = control.type === "checkbox"
        ? control.checked
        : control.type === "number"
          ? Number(control.value)
          : control.value;
      settingsDrafts.set(gameId, draft);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-round-action]").forEach((button) => {
    button.addEventListener("click", () => void mutate("/rounds/" + button.dataset.roundId + "/" + button.dataset.roundAction));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-queue-action]").forEach((button) => {
    button.addEventListener("click", () => void mutate("/queue/" + button.dataset.ticketId + "/" + button.dataset.queueAction));
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
    // 参数区有焦点时暂停自动重渲染，避免打字到一半输入框被重建；
    // 未保存的草稿由 settingsDrafts 保留，显式操作（force）始终重渲染。
    if (force || (changed && !(activeView === "games" && settingsBusy()))) {
      render();
    }
  } catch {
    if (!snapshot) {
      root.innerHTML = '<main class="boot boot--error"><strong>无法连接本地主机 :3001</strong><span>请确认 server 已启动。</span></main>';
    }
  }
}

render();
void refresh(true);
window.setInterval(() => void refresh(), 800);

import type {
  EntertainmentRound,
  GameManifestV1,
  PlatformSnapshot,
  QueueTicket,
} from "@waiting/shared";
import "./style.css";

const API = location.protocol + "//" + location.hostname + ":3001/api/platform";
const root = document.querySelector<HTMLDivElement>("#app")!;
const parts = location.pathname.split("/").filter(Boolean);
const queueMode = parts[0] === "queue";
const code = queueMode
  ? ""
  : (parts.at(-1) || new URLSearchParams(location.search).get("code") || "")
      .trim()
      .toUpperCase();

type QueueView = {
  ticket: QueueTicket;
  ahead: number;
  position: number | null;
  waitingCount: number;
};

let snapshot: PlatformSnapshot | null = null;
let round: EntertainmentRound | undefined;
let game: GameManifestV1 | undefined;
let joinedName = "";
let watchTimer: number | undefined;
let redirecting = false;

let queueTicketId = queueMode ? (parts[1] ?? "") : "";
let queueView: QueueView | null = null;
let queueError = "";
let queueWatchTimer: number | undefined;
let alertAudio: AudioContext | undefined;

try {
  if (!queueTicketId && queueMode) {
    queueTicketId = localStorage.getItem("waiting-queue-ticket-id") || "";
  }
  joinedName = sessionStorage.getItem("waiting-round:" + code + ":name") || "";
} catch {}

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

function queueStatusText(value: QueueTicket["status"]) {
  return {
    waiting: "等位中",
    called: "到号啦",
    passed: "已过号",
    seated: "已入座",
    cancelled: "已取消",
  }[value];
}

function minutesSince(value: number) {
  return Math.max(0, Math.floor((Date.now() - value) / 60_000));
}

async function primeAlerting() {
  try {
    alertAudio ??= new AudioContext();
    if (alertAudio.state === "suspended") await alertAudio.resume();
  } catch {}

  if ("Notification" in window && window.isSecureContext && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }
}

function playCallTone() {
  if (!alertAudio) return;
  try {
    if (alertAudio.state === "suspended") void alertAudio.resume();
    const now = alertAudio.currentTime;
    [0, 0.34, 0.68].forEach((offset, index) => {
      const oscillator = alertAudio!.createOscillator();
      const gain = alertAudio!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = index === 2 ? 1046 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.26);
      oscillator.connect(gain);
      gain.connect(alertAudio!.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.28);
    });
  } catch {}
}

function triggerQueueCallAlert(view: QueueView) {
  const calledAt = view.ticket.calledAt;
  if (view.ticket.status !== "called" || !calledAt) return;

  const key = view.ticket.id + ":" + calledAt;
  try {
    if (localStorage.getItem("waiting-queue-last-alert") === key) return;
    localStorage.setItem("waiting-queue-last-alert", key);
  } catch {}

  playCallTone();
  try {
    navigator.vibrate?.([320, 120, 320, 120, 700]);
  } catch {}

  if (
    "Notification" in window &&
    window.isSecureContext &&
    Notification.permission === "granted"
  ) {
    try {
      new Notification(view.ticket.number + " 到号了", {
        body: view.ticket.partySize + " 人桌 · 请前往前台",
        tag: "waiting-queue-" + view.ticket.id,
      });
    } catch {}
  }

  document.title = "🔔 " + view.ticket.number + " 到号了";
  window.setTimeout(() => {
    if (queueView?.ticket.status !== "called") document.title = "Waiting Entertainment";
  }, 12_000);
}

function queueReminderCopy() {
  const systemNotification =
    "Notification" in window && window.isSecureContext
      ? "浏览器支持时可发送系统通知"
      : "当前局域网页以页面声音 / 震动提醒为主";
  return systemNotification + "；请不要完全关闭此页面。";
}

function renderQueue() {
  if (!queueTicketId) {
    root.innerHTML =
      '<main class="guest-shell queue-shell"><section class="join-card queue-card">' +
        '<div class="brand"><span>WE</span><strong>WAITING ENTERTAINMENT</strong></div>' +
        '<span class="eyebrow">SELF SERVICE QUEUE</span>' +
        '<h1>扫码取号</h1><p class="summary">填写用餐人数，取号后手机会持续显示排队进度；服务员叫号时页面会响铃并尽可能震动提醒。</p>' +
        '<form id="queue-join-form" class="queue-join-form">' +
          '<label><span>用餐人数</span><input name="partySize" type="number" inputmode="numeric" min="1" max="30" value="2" required /></label>' +
          '<label><span>怎么称呼</span><input name="label" maxlength="40" autocomplete="name" placeholder="如：王先生（可选）" /></label>' +
          '<button type="submit">确认取号</button>' +
          '<small>' + esc(queueReminderCopy()) + '</small>' +
        '</form>' +
        '<div id="message" class="message" aria-live="polite">' + esc(queueError) + '</div>' +
      '</section></main>';

    document.querySelector<HTMLFormElement>("#queue-join-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void createQueueTicket(event.currentTarget as HTMLFormElement);
    });
    return;
  }

  if (!queueView) {
    root.innerHTML =
      '<main class="guest-shell queue-shell"><section class="join-card loading-card">' +
        '<div class="pulse"></div><strong>' + (queueError ? esc(queueError) : "正在读取等位进度…") + '</strong>' +
        (queueError ? '<button id="queue-reset" class="secondary-action">重新取号</button>' : "") +
      '</section></main>';
    document.querySelector<HTMLButtonElement>("#queue-reset")?.addEventListener("click", resetQueueTicket);
    return;
  }

  const ticket = queueView.ticket;
  const waiting = ticket.status === "waiting";
  const called = ticket.status === "called";
  const ended = ticket.status === "seated" || ticket.status === "cancelled";
  const statusClass = called ? " queue-card--called" : ticket.status === "passed" ? " queue-card--passed" : "";

  const progress = waiting
    ? '<div class="queue-progress"><div><strong>' + queueView.ahead + '</strong><span>前方桌数</span></div>' +
      '<div><strong>' + (queueView.position ?? "—") + '</strong><span>当前顺位</span></div>' +
      '<div><strong>' + minutesSince(ticket.createdAt) + '<small>m</small></strong><span>已等待</span></div></div>'
    : '<div class="queue-progress"><div><strong>' + queueView.waitingCount + '</strong><span>当前等位桌数</span></div>' +
      '<div><strong>' + ticket.partySize + '</strong><span>用餐人数</span></div>' +
      '<div><strong>' + minutesSince(ticket.createdAt) + '<small>m</small></strong><span>取号至今</span></div></div>';

  const mainCopy = called
    ? "请现在前往前台，向服务员出示号码。"
    : ticket.status === "passed"
      ? "当前已过号，请留意页面；服务员可以为你再次叫号。"
      : ticket.status === "seated"
        ? "本次等位已完成，祝用餐愉快。"
        : ticket.status === "cancelled"
          ? "本次等位已经取消。"
          : queueView.ahead === 0
            ? "你已经排在最前，请留意叫号。"
            : "前面还有 " + queueView.ahead + " 桌，请在附近等候。";

  root.innerHTML =
    '<main class="guest-shell queue-shell"><section class="join-card queue-card' + statusClass + '">' +
      '<div class="brand"><span>WE</span><strong>WAITING ENTERTAINMENT</strong></div>' +
      '<span class="eyebrow">RESTAURANT QUEUE · ' + queueStatusText(ticket.status) + '</span>' +
      '<div class="queue-number">' + esc(ticket.number) + '</div>' +
      '<div class="queue-party">' + ticket.partySize + ' 人' + (ticket.label ? " · " + esc(ticket.label) : "") + '</div>' +
      (called ? '<div class="call-burst"><span>🔔</span><strong>到号啦</strong></div>' : "") +
      '<p class="queue-main-copy">' + esc(mainCopy) + '</p>' +
      progress +
      (!ended
        ? '<div class="queue-reminder"><strong>手机提醒已启用</strong><span>' + esc(queueReminderCopy()) + '</span>' +
          '<button id="enable-alerts" class="secondary-action">重新开启声音提醒</button></div>'
        : "") +
      (!ended
        ? '<button id="cancel-queue" class="danger-action">取消等位</button>'
        : '<button id="queue-reset" class="secondary-action">重新取号</button>') +
      '<div id="message" class="message" aria-live="polite">' + esc(queueError) + '</div>' +
    '</section></main>';

  document.querySelector<HTMLButtonElement>("#enable-alerts")?.addEventListener("click", () => {
    void primeAlerting().then(() => playCallTone());
  });
  document.querySelector<HTMLButtonElement>("#cancel-queue")?.addEventListener("click", () => void cancelQueueTicket());
  document.querySelector<HTMLButtonElement>("#queue-reset")?.addEventListener("click", resetQueueTicket);
}

async function createQueueTicket(formElement: HTMLFormElement) {
  const form = new FormData(formElement);
  const partySize = Number(form.get("partySize"));
  const label = String(form.get("label") ?? "").trim().slice(0, 40);
  const button = formElement.querySelector<HTMLButtonElement>("button");
  const message = document.querySelector<HTMLDivElement>("#message");
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 30) return;

  if (button) button.disabled = true;
  if (message) message.textContent = "正在取号…";
  void primeAlerting();

  try {
    queueView = await api("/queue", {
      method: "POST",
      body: JSON.stringify({ partySize, label }),
    }) as QueueView;
    queueTicketId = queueView.ticket.id;
    queueError = "";
    try {
      localStorage.setItem("waiting-queue-ticket-id", queueTicketId);
    } catch {}
    history.replaceState(null, "", "/queue/" + encodeURIComponent(queueTicketId));
    renderQueue();
    startQueueWatch();
  } catch {
    queueError = "取号失败，请确认手机与门店大屏在同一 Wi-Fi。";
    renderQueue();
  }
}

async function cancelQueueTicket() {
  if (!queueTicketId || !queueView) return;
  try {
    const payload = await api("/queue/" + encodeURIComponent(queueTicketId) + "/cancel", {
      method: "POST",
      body: "{}",
    }) as QueueView;
    queueView = payload;
    queueError = "";
    renderQueue();
    stopQueueWatch();
  } catch {
    queueError = "取消失败，请稍后重试或联系服务员。";
    renderQueue();
  }
}

function resetQueueTicket() {
  stopQueueWatch();
  queueTicketId = "";
  queueView = null;
  queueError = "";
  try {
    localStorage.removeItem("waiting-queue-ticket-id");
  } catch {}
  history.replaceState(null, "", "/queue");
  renderQueue();
}

function startQueueWatch() {
  if (queueWatchTimer !== undefined) return;
  queueWatchTimer = window.setInterval(() => void refreshQueue(), 1_200);
}

function stopQueueWatch() {
  if (queueWatchTimer === undefined) return;
  window.clearInterval(queueWatchTimer);
  queueWatchTimer = undefined;
}

async function refreshQueue() {
  if (!queueTicketId) {
    renderQueue();
    return;
  }
  try {
    const next = await api("/queue/" + encodeURIComponent(queueTicketId)) as QueueView;
    const previousStatus = queueView?.ticket.status;
    const previousCalledAt = queueView?.ticket.calledAt;
    queueView = next;
    queueError = "";
    renderQueue();

    if (
      next.ticket.status === "called" &&
      (previousStatus !== "called" || previousCalledAt !== next.ticket.calledAt)
    ) {
      triggerQueueCallAlert(next);
    }

    if (next.ticket.status === "seated" || next.ticket.status === "cancelled") {
      stopQueueWatch();
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "queue-ticket-not-found") {
      queueView = null;
      queueError = "这个等位号已失效，请重新取号。";
      try {
        localStorage.removeItem("waiting-queue-ticket-id");
      } catch {}
    } else {
      queueError = "暂时连接不到门店主机，正在继续重试…";
    }
    renderQueue();
  }
}

function renderRound() {
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
    void joinRound(name);
  });
}

async function joinRound(name: string) {
  const message = document.querySelector<HTMLDivElement>("#message");
  const button = document.querySelector<HTMLButtonElement>("#join-form button");
  if (button) button.disabled = true;
  if (message) message.textContent = "正在锁定本轮席位…";

  let queueId = "";
  try {
    queueId = localStorage.getItem("waiting-queue-ticket-id") || "";
  } catch {}

  try {
    const payload = await api("/join/" + encodeURIComponent(code), {
      method: "POST",
      body: JSON.stringify({ name, ...(queueId ? { queueTicketId: queueId } : {}) }),
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

    renderRound();
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
  try {
    const queueId = localStorage.getItem("waiting-queue-ticket-id");
    if (queueId) target.searchParams.set("queueTicketId", queueId);
  } catch {}
  location.replace(target.toString());
}

function startRoundWatch() {
  if (watchTimer !== undefined) return;
  watchTimer = window.setInterval(() => void refreshRound(true), 500);
}

async function refreshRound(fromWatch = false) {
  try {
    snapshot = (await api()) as PlatformSnapshot;
    round = snapshot.rounds.find((item) => item.code === code);
    game = round ? snapshot.games.find((item) => item.id === round?.gameId) : undefined;
    renderRound();
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

if (queueMode) {
  renderQueue();
  if (queueTicketId) {
    void primeAlerting();
    void refreshQueue().then(() => {
      if (queueView && !["seated", "cancelled"].includes(queueView.ticket.status)) {
        startQueueWatch();
      }
    });
  }
  window.addEventListener("focus", () => void refreshQueue());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refreshQueue();
  });
} else {
  renderRound();
  void refreshRound().then(() => {
    if (joinedName) startRoundWatch();
  });
}

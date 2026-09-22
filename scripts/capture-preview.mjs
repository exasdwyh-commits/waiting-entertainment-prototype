import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("docs/screenshots", { recursive: true });

const browser = await chromium.launch({ headless: true });

async function platform(path = "", options = {}) {
  const response = await fetch("http://127.0.0.1:3001/api/platform" + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      (options.method ?? "GET") +
        " " +
        path +
        " -> " +
        response.status +
        ": " +
        JSON.stringify(body),
    );
  }
  return body;
}

try {
  const host = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await host.goto("http://127.0.0.1:5175", { waitUntil: "networkidle" });

  // Capture game management before creating the timed regression round. This
  // keeps the original 18-second replay baseline deterministic instead of
  // spending part of the round budget on an unrelated admin screenshot.
  await host.locator('[data-view="games"]').click();
  await host.locator(".management").waitFor({ timeout: 8_000 });
  if ((await host.locator(".manage-card").count()) < 3) {
    throw new Error("Game management did not render the full package catalog.");
  }
  await host.screenshot({
    path: "docs/screenshots/hub-game-management.png",
    fullPage: true,
  });
  await host.locator('[data-view="live"]').click();
  await host.locator(".workspace").waitFor({ timeout: 8_000 });

  // Exercise Hub round/signup surfaces after the management capture so the
  // timed round starts with its full budget.
  const created = await platform("/rounds", {
    method: "POST",
    body: JSON.stringify({ gameId: "table-push-king", playerLimit: 4 }),
  });
  const round = created.round;
  if (!round?.code || !round?.id) {
    throw new Error("Hub round creation did not return id/code.");
  }
  await host.waitForSelector(".round-code", { timeout: 8_000 });
  await host.screenshot({
    path: "docs/screenshots/hub-host.png",
    fullPage: true,
  });

  const screen = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  screen.on("console", (message) => {
    console.log("[screen console]", message.type(), message.text());
  });
  screen.on("pageerror", (error) => {
    console.error("[screen pageerror]", error.message);
  });
  await screen.goto("http://127.0.0.1:5176", { waitUntil: "domcontentloaded" });
  await screen.waitForFunction(() => {
    const code = document.querySelector("#round-code")?.textContent?.trim();
    return code && code !== "------";
  });
  await screen.screenshot({
    path: "docs/screenshots/hub-broadcast-recruiting.png",
    fullPage: true,
  });

  const guest = await browser.newPage({
    viewport: { width: 430, height: 860 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await guest.goto(
    "http://127.0.0.1:5177/join/" + encodeURIComponent(round.code),
    { waitUntil: "networkidle" },
  );
  await guest.waitForSelector("#join-form");
  await guest.screenshot({
    path: "docs/screenshots/hub-guest-join.png",
    fullPage: true,
  });

  await guest.locator('input[name="name"]').fill("Preview Guest");
  await guest.locator("#join-form button").click();
  await guest.locator(".joined-wait").waitFor({ timeout: 10_000 });

  if (!guest.url().includes(":5177/")) {
    throw new Error(
      "Embedded-game signup should remain on the Hub waiting page before host start. url=" +
        guest.url(),
    );
  }

  await host.waitForFunction(
    () =>
      document.querySelector(".round-stats strong")?.textContent?.trim() === "1",
    { timeout: 10_000 },
  );

  await host.locator('[data-round-action="lock"]').click();
  await host.locator('[data-round-action="start"]').waitFor({ timeout: 8_000 });
  await host.locator('[data-round-action="start"]').click();

  await guest.waitForURL(/:5174\//, { timeout: 12_000 });
  await guest.waitForFunction(
    () => {
      const text = document.querySelector("#status")?.textContent ?? "";
      return text.includes("已加入") || text.includes("已恢复控制");
    },
    { timeout: 12_000 },
  );

  await screen.waitForFunction(
    () => document.querySelector("#mode-label")?.textContent === "LIVE_GAME",
    { timeout: 10_000 },
  );
  await screen.waitForTimeout(2_000);
  // Keep the venue screen foregrounded while validating its polling/focus
  // recovery. Headless Chromium throttles background-page timers aggressively.
  await screen.bringToFront();
  // The server retains the latest called ticket; the Broadcast Shell owns the
  // presentation window across embedded and external Game Packages.
  const ticket = await platform("/queue", {
    method: "POST",
    body: JSON.stringify({ partySize: 4, label: "Preview Table" }),
  });
  await platform("/queue/" + ticket.ticket.id + "/call", {
    method: "POST",
    body: "{}",
  });

  const queueDeadline = Date.now() + 10_000;
  let broadcastQueue;
  while (Date.now() < queueDeadline) {
    const broadcast = await platform("/broadcast");
    if (broadcast.queueOverlay?.ticketId === ticket.ticket.id) {
      broadcastQueue = broadcast.queueOverlay;
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  if (!broadcastQueue) {
    throw new Error("Platform broadcast never exposed the newly called queue ticket.");
  }

  await screen.waitForFunction(
    (ticketId) => {
      const overlay = document.querySelector("#queue-overlay");
      const number = document.querySelector("#queue-number")?.textContent?.trim();
      return (
        overlay instanceof HTMLElement &&
        !overlay.hidden &&
        number &&
        number.length > 0 &&
        document.body.innerText.includes(number)
      );
    },
    ticket.ticket.id,
    { timeout: 10_000 },
  );
  await screen.screenshot({
    path: "docs/screenshots/hub-broadcast-queue.png",
    fullPage: true,
  });

  await platform("/rounds/" + round.id + "/finish", {
    method: "POST",
    body: "{}",
  });

  await guest.close();
  await host.close();
  await screen.close();

  // Keep the original direct-game visual regression and replay assertion.
  const big = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await big.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });

  const phone = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await phone.goto("http://127.0.0.1:5174", { waitUntil: "networkidle" });

  await big.waitForTimeout(8_500);

  await big.screenshot({
    path: "docs/screenshots/big-screen.png",
    fullPage: true,
  });

  await phone.screenshot({
    path: "docs/screenshots/phone-player.png",
    fullPage: true,
  });

  await big.waitForFunction(
    () => {
      const bug = document.querySelector("#broadcast-bug");
      const message = document.querySelector("#message");
      const caption = message?.textContent?.trim() ?? "";
      return (
        bug?.getAttribute("data-mode") === "replay" &&
        message?.classList.contains("replay-caption") &&
        caption.length > 0 &&
        (caption.includes("×") || caption.includes("反打机位"))
      );
    },
    { timeout: 72_000 },
  );

  // The wait above is the replay functional assertion. Capture immediately;
  // do not re-read the short-lived replay state in separate round trips.
  await big.screenshot({
    path: "docs/screenshots/broadcast-replay.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}

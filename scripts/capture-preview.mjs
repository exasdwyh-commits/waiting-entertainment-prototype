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
  // Verify the idle media library before creating an active game round.
  const previewMedia = await platform("/content/media", {
    method: "POST",
    body: JSON.stringify({
      kind: "message",
      title: "Visual Preview Media",
      headline: "今晚一起玩一局",
      subline: "候场媒体库已接管大屏空闲时段",
      durationSeconds: 8,
    }),
  });
  await platform("/content/media/" + previewMedia.media.id + "/up", {
    method: "POST",
    body: "{}",
  });

  const idleScreen = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await idleScreen.goto("http://127.0.0.1:5176", {
    waitUntil: "domcontentloaded",
  });
  await idleScreen.waitForFunction(
    () => document.querySelector("#idle-headline")?.textContent === "今晚一起玩一局",
    { timeout: 10_000 },
  );
  await idleScreen.screenshot({
    path: "docs/screenshots/hub-broadcast-idle-media.png",
    fullPage: true,
  });
  await idleScreen.close();

  // Exercise hosted round/signup surfaces next.
  const created = await platform("/rounds", {
    method: "POST",
    body: JSON.stringify({ gameId: "table-push-king", playerLimit: 4 }),
  });
  const round = created.round;
  if (!round?.code || !round?.id) {
    throw new Error("Hub round creation did not return id/code.");
  }

  const host = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await host.goto("http://127.0.0.1:5175", { waitUntil: "networkidle" });
  await host.waitForSelector(".round-code");
  await host.screenshot({
    path: "docs/screenshots/hub-host.png",
    fullPage: true,
  });

  const screen = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
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
  const liveFrame = screen.frameLocator("#game-frame");
  await liveFrame.locator("#hub-queue-overlay").waitFor({
    state: "attached",
    timeout: 30_000,
  });

  // The server retains the latest called ticket; the live game owns the
  // 10-second presentation window once it observes a new calledAt value.
  const ticket = await platform("/queue", {
    method: "POST",
    body: JSON.stringify({ partySize: 4, label: "Preview Table" }),
  });
  await platform("/queue/" + ticket.ticket.id + "/call", {
    method: "POST",
    body: "{}",
  });
  await liveFrame
    .locator("#hub-queue-overlay:not([hidden])")
    .waitFor({ timeout: 10_000 });
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

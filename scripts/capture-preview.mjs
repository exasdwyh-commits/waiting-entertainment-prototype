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
  // Exercise Hub surfaces first so round/signup regressions fail quickly.
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
  await guest.waitForTimeout(1_800);

  if (!guest.url().includes(":5174/")) {
    const message = await guest.locator("#message").textContent().catch(() => null);
    throw new Error(
      "Guest signup did not redirect to controller. url=" +
        guest.url() +
        " message=" +
        JSON.stringify(message),
    );
  }

  await guest.waitForFunction(
    () =>
      document.querySelector("#status")?.textContent?.includes("等待主持人开局"),
    { timeout: 10_000 },
  );

  await host.waitForFunction(
    () =>
      document.querySelector(".round-stats strong")?.textContent?.trim() === "1",
    { timeout: 10_000 },
  );

  await host.locator('[data-round-action="lock"]').click();
  await host.locator('[data-round-action="start"]').waitFor({ timeout: 8_000 });
  await host.locator('[data-round-action="start"]').click();

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

  // The server retains the latest called ticket; the Broadcast Shell owns the
  // 10-second presentation window once it observes a new calledAt value.
  const ticket = await platform("/queue", {
    method: "POST",
    body: JSON.stringify({ partySize: 4, label: "Preview Table" }),
  });
  await platform("/queue/" + ticket.ticket.id + "/call", {
    method: "POST",
    body: "{}",
  });
  await screen
    .frameLocator("#game-frame")
    .locator("#hub-queue-overlay:not([hidden])")
    .waitFor({ timeout: 15_000 });
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

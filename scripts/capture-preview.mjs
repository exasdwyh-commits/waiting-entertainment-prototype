import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("docs/screenshots", { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
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

  // Let the controller join, the countdown finish, and the director settle
  // into a real live-game shot before taking the normal previews.
  await big.waitForTimeout(8_500);

  await big.screenshot({
    path: "docs/screenshots/big-screen.png",
    fullPage: true,
  });

  await phone.screenshot({
    path: "docs/screenshots/phone-player.png",
    fullPage: true,
  });

  // This is also a functional broadcast/replay smoke test. A normal round
  // must eventually enter the replay package. If it never does, fail the
  // workflow rather than silently committing a stale "replay" screenshot.
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

  const replayModeBefore = await big
    .locator("#broadcast-bug")
    .getAttribute("data-mode");
  const replayCaption = (await big
    .locator("#message")
    .textContent())?.trim();

  if (replayModeBefore !== "replay" || !replayCaption) {
    throw new Error("Replay state disappeared before capture.");
  }

  await big.screenshot({
    path: "docs/screenshots/broadcast-replay.png",
    fullPage: true,
  });

  const replayModeAfter = await big
    .locator("#broadcast-bug")
    .getAttribute("data-mode");
  const captionStillReplay = await big
    .locator("#message")
    .evaluate((node) => node.classList.contains("replay-caption"));
  if (replayModeAfter !== "replay" || !captionStillReplay) {
    throw new Error("Replay ended during screenshot capture; retry the visual preview.");
  }
} finally {
  await browser.close();
}

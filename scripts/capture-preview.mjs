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
  await big.waitForSelector('#broadcast-bug[data-mode="replay"]', {
    timeout: 72_000,
  });
  await big.waitForTimeout(650);

  await big.screenshot({
    path: "docs/screenshots/broadcast-replay.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}

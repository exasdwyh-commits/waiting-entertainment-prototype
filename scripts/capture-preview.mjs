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
  await big.waitForTimeout(6500);
  await big.screenshot({
    path: "docs/screenshots/big-screen.png",
    fullPage: true,
  });

  const phone = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await phone.goto("http://127.0.0.1:5174", { waitUntil: "networkidle" });
  await phone.waitForTimeout(4500);
  await phone.screenshot({
    path: "docs/screenshots/phone-player.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}

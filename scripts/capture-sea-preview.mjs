import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("docs/screenshots", { recursive: true });

const base = "http://127.0.0.1:9020";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

try {
  const display = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await display.goto(base + "/display", { waitUntil: "domcontentloaded" });
  await display.waitForSelector("#scene canvas", { timeout: 15_000 });
  await display.waitForTimeout(2_500);

  const start = await fetch(base + "/api/start", { method: "POST" });
  if (!start.ok) throw new Error("POST /api/start failed: " + start.status);

  await display.waitForFunction(
    () => document.querySelector("#phase")?.textContent === "海域激战",
    null,
    { timeout: 20_000 },
  );
  await display.waitForTimeout(2_000);

  if ((await display.locator("#ranks li").count()) !== 8) {
    throw new Error("Sea Battle preview did not render all eight ranked ships.");
  }

  await display.screenshot({
    path: "docs/screenshots/sea-battle-live.png",
    fullPage: false,
    timeout: 120_000,
  });

  await display.locator("#monster-warning:not([hidden])").waitFor({
    timeout: 45_000,
  });
  await display.waitForTimeout(1_000);
  await display.screenshot({
    path: "docs/screenshots/sea-battle-monster.png",
    fullPage: false,
    timeout: 120_000,
  });
} finally {
  await browser.close();
}

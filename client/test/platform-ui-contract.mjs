import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const host = readFileSync(new URL("../../host/src/main.ts", import.meta.url), "utf8");
const hostCss = readFileSync(new URL("../../host/src/style.css", import.meta.url), "utf8");
const screen = readFileSync(new URL("../../screen/src/main.ts", import.meta.url), "utf8");
const screenCss = readFileSync(new URL("../../screen/src/style.css", import.meta.url), "utf8");
const client = readFileSync(new URL("../../client/src/main.ts", import.meta.url), "utf8");
const preview = readFileSync(new URL("../../scripts/capture-preview.mjs", import.meta.url), "utf8");

assert.match(host, /data-view="games"/);
assert.match(host, /游戏管理中心/);
assert.match(host, /snapshot\.allGames/);
assert.match(host, /data-runtime-start/);
assert.match(host, /data-runtime-stop/);
assert.match(host, /data-runtime-check/);
assert.match(host, /data-runtime-logs/);
assert.match(host, /configSource/);
assert.match(host, /game\.settings/);
assert.match(host, /默认参数/);
assert.match(host, /round-card--degraded/);
assert.match(hostCss, /\.manage-grid/);
assert.match(hostCss, /\.round-runtime-alert/);

assert.match(screen, /id="runtime-alert"/);
assert.match(screen, /state\.mode === "LIVE_GAME"/);
assert.match(screen, /runtime\?\.state !== "running"/);
assert.match(screen, /game-frame--degraded/);
assert.match(screenCss, /\.runtime-alert \{/);
assert.match(screenCss, /z-index: 16/);
assert.match(screenCss, /\.queue-overlay \{\s*position: absolute; z-index: 20/);
assert.match(screen, /shellQueue/);
assert.match(screen, /refreshIssued/);
assert.match(screen, /refreshId < refreshApplied/);
assert.match(screen, /addEventListener\("focus"/);
assert.match(screen, /visibilitychange/);
assert.match(client, /shellOwnsQueue/);
assert.match(preview, /#queue-overlay/);
assert.match(preview, /broadcast\.queueOverlay\?\.ticketId/);

console.log("Platform UI contract passed: game management controls and runtime-degradation fallbacks are present.");

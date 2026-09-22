import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../../screen/src/main.ts", import.meta.url), "utf8");
const screenCss = readFileSync(new URL("../../screen/src/style.css", import.meta.url), "utf8");
const host = readFileSync(new URL("../../host/src/main.ts", import.meta.url), "utf8");
const hostCss = readFileSync(new URL("../../host/src/style.css", import.meta.url), "utf8");

assert.match(screen, /id="runtime-alert"/);
assert.match(screen, /state\.mode === "LIVE_GAME"/);
assert.match(screen, /game\?\.runtime\.kind === "process"/);
assert.match(screen, /runtime\?\.state !== "running"/);
assert.match(screen, /game-frame--degraded/);
assert.match(screen, /运行中断/);

assert.match(screenCss, /\.runtime-alert \{/);
assert.match(screenCss, /z-index: 16/);
assert.match(screenCss, /\.queue-overlay \{\s*position: absolute; z-index: 20/);

assert.match(host, /const runtimeDegraded =/);
assert.match(host, /round\.status === "running"/);
assert.match(host, /round-card--degraded/);
assert.match(host, /RUNTIME DEGRADED/);
assert.match(host, /data-runtime-check/);
assert.match(host, /data-runtime-logs/);
assert.match(hostCss, /\.round-runtime-alert \{/);

console.log("Platform UI contract passed: external runtime degradation is visible on both Host and Broadcast Shell while queue overlays retain priority.");

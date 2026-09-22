import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/app.mjs", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../game-package.json", import.meta.url), "utf8"));
const visualAssets = JSON.parse(
  readFileSync(new URL("../public/assets/sea-battle-assets.json", import.meta.url), "utf8"),
);

test("Sea Battle package follows Hub process contract", () => {
  assert.equal(manifest.runtime.kind, "process");
  assert.equal(manifest.runtime.healthProtocol, "sea-battle/1");
  assert.equal(manifest.runtime.workingDirectoryEnv, "SEA_BATTLE_DIR");
  assert.equal(manifest.runtime.port, 9020);
  assert.equal(manifest.runtime.startPath, "/api/start");
  assert.deepEqual(manifest.commercial.entitlements, ["game:sea-battle"]);
});

test("Hub-admitted guests autojoin without a duplicate nickname screen", () => {
  assert.match(app, /query\.get\("hub"\) === "1"/);
  assert.match(app, /query\.get\("name"\)/);
  assert.match(app, /socket\.emit\("join", \{ token, name: hubName \}\)/);
  assert.match(css, /body\.hub-admission #join-card\{display:none\}/);
  assert.match(css, /body\.hub-mode #display-tools\{display:none\}/);
});

test("managed round shutdown returns phones to the Hub round page", () => {
  assert.match(app, /returnToHubWhenRoundEnds/);
  assert.match(app, /:3001\/api\/platform/);
  assert.match(app, /:5177\/join\//);
  assert.match(app, /finished", "cancelled", "expired"/);
});

test("V2 player feedback exposes stage, storm and broadside lock cues", () => {
  assert.match(html, /id="stage-chip"/);
  assert.match(html, /id="broadside-status"/);
  assert.match(html, /id="storm-warning"/);
  assert.match(app, /function findBroadsideLock/);
  assert.match(app, /safeZoneRing/);
  assert.match(app, /if \(state\.monster\?\.alive\)/);
  assert.match(app, /nearest living challenger/);
  assert.match(css, /body\[data-stage="maelstrom"\]/);
});

test("venue broadcast keeps ships and the boss visually readable", () => {
  assert.match(app, /monsterHalo/);
  assert.match(app, /isDisplay \? 1\.24 : 1/);
  assert.match(app, /nearest living challenger/);
  assert.match(app, /window\.__seaBroadcast/);
  assert.match(app, /boss: Boolean\(state\.monster\?\.alive\)/);
});


test("V4 visual assets are optional and preserve procedural fallbacks", () => {
  assert.equal(visualAssets.schemaVersion, 1);
  assert.equal(visualAssets.ship.url, null);
  assert.equal(visualAssets.monster.url, null);
  assert.deepEqual(visualAssets.islands, []);
  assert.match(html, /type="importmap"/);
  assert.match(html, /three\/addons\//);
  assert.match(app, /GLTFLoader/);
  assert.match(app, /loadVisualAssets/);
  assert.match(app, /proceduralVisual\.visible = false/);
  assert.match(app, /monsterProcedural\.visible = false/);
  assert.match(app, /proceduralIslandRoot\.visible = false/);
  assert.match(app, /Sea Battle ship asset fallback/);
});

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PILOT_DIR = resolve(ROOT, "games/pilot-racer");
const PILOT_REPO = "https://github.com/exasdwyh-commits/pilot-racer.git";
const PILOT_REF = "112bfe18dff7065fc98f12ae85c9679f1527b216";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function run(command, args, options = {}) {
  console.log("\n> " + commandLine(command, args));
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: process.env,
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input: options.input,
    encoding: "utf8"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`command failed (${result.status ?? "signal"}): ${commandLine(command, args)}`);
  }
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: process.env,
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input: options.input,
    encoding: "utf8"
  });
  return !result.error && result.status === 0;
}

function installDependencies(cwd, productionOnly = false) {
  const hasLock = existsSync(resolve(cwd, "package-lock.json"));
  const args = [hasLock ? "ci" : "install", "--no-audit", "--no-fund"];
  if (productionOnly) args.push("--omit=dev");
  run(npm, args, { cwd });
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 22) {
  throw new Error(`Node.js 22+ is required; current version is ${process.version}`);
}

run("git", ["--version"]);
mkdirSync(resolve(ROOT, "games"), { recursive: true });

if (existsSync(PILOT_DIR) && !existsSync(resolve(PILOT_DIR, ".git"))) {
  const entries = readdirSync(PILOT_DIR);
  if (entries.length > 0) {
    throw new Error("games/pilot-racer already exists but is not the managed checkout. Move or remove it, then rerun npm run setup.");
  }
  rmSync(PILOT_DIR, { recursive: true, force: true });
}

if (!existsSync(resolve(PILOT_DIR, ".git"))) {
  run("git", ["clone", "--filter=blob:none", "--no-checkout", "--depth", "1", PILOT_REPO, PILOT_DIR]);
}

const sparsePatterns = [
  "/package.json",
  "/package-lock.json",
  "/server.mjs",
  "/ads.json",
  "/License.txt",
  "/THIRD_PARTY_NOTICES.md",
  "/licenses/**",
  "/public/index.html",
  "/public/styles.css",
  "/public/app.mjs",
  "/public/audio-engine.mjs",
  "/public/broadcast-cameras.mjs",
  "/public/scenery.mjs",
  "/public/simulation.mjs",
  "/public/item-visuals.mjs",
  "/public/garage.html",
  "/public/garage.css",
  "/public/garage.mjs",
  "/public/models/**",
  "/public/audio/*.mp3",
  "!/public/audio/*.bak.mp3",
  "!/public/audio/draft/**",
  "/assets/models/roster.json",
  "/assets/models/hyper3d-2026-09-19/crimson-kart-parts-candidate.glb",
  "/assets/models/hyper3d-tech-roster/*-shaded.glb",
  "/assets/textures/asphalt_track_diff_1k.png",
  "/assets/textures/asphalt_track_nor_gl_1k.png"
].join("\n") + "\n";

let sparse = tryRun("git", ["-C", PILOT_DIR, "sparse-checkout", "init", "--no-cone"]);
if (sparse) {
  sparse = tryRun("git", ["-C", PILOT_DIR, "sparse-checkout", "set", "--no-cone", "--stdin"], { input: sparsePatterns });
}
if (!sparse) {
  console.warn("Sparse checkout is unavailable; falling back to a full Pilot Racer checkout.");
  tryRun("git", ["-C", PILOT_DIR, "sparse-checkout", "disable"]);
}

let pinnedFetched = tryRun("git", ["-C", PILOT_DIR, "fetch", "--depth", "1", "origin", PILOT_REF]);
if (!pinnedFetched) {
  console.warn("Pinned Pilot Racer commit fetch failed; falling back to current origin/main.");
  run("git", ["-C", PILOT_DIR, "fetch", "--depth", "1", "origin", "main"]);
}
run("git", ["-C", PILOT_DIR, "checkout", "--detach", "FETCH_HEAD"]);

for (const required of [
  "package.json",
  "server.mjs",
  "public/app.mjs",
  "public/simulation.mjs",
  "assets/models/hyper3d-2026-09-19/crimson-kart-parts-candidate.glb",
  "assets/textures/asphalt_track_diff_1k.png",
  "assets/textures/asphalt_track_nor_gl_1k.png"
]) {
  if (!existsSync(resolve(PILOT_DIR, required))) {
    throw new Error(`Pilot Racer runtime is incomplete: missing ${required}`);
  }
}

console.log("\nInstalling main workspace dependencies...");
installDependencies(ROOT, false);

console.log("\nInstalling Pilot Racer production dependencies...");
installDependencies(PILOT_DIR, true);

run("node", ["--check", "server.mjs"], { cwd: PILOT_DIR });
run("node", ["--check", "public/app.mjs"], { cwd: PILOT_DIR });

console.log("\nBuilding Waiting Entertainment...");
run(npm, ["run", "build"], { cwd: ROOT });

console.log("\nSetup complete.");
console.log("Start the local demo with: npm start");
console.log("Host Console: http://127.0.0.1:5175");
console.log("Broadcast:    http://127.0.0.1:5176");

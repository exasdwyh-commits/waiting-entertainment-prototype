import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const plan = process.env.WAITING_PLAN?.trim() || "PRO";

console.log(`Starting Waiting Entertainment local demo · plan=${plan}`);
console.log("Host Console: http://127.0.0.1:5175");
console.log("Broadcast:    http://127.0.0.1:5176");

const result = spawnSync(npm, ["run", "dev"], {
  cwd: ROOT,
  env: { ...process.env, WAITING_PLAN: plan },
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

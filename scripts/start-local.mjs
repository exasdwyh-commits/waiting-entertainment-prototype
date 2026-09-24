import { spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const plan = process.env.WAITING_PLAN?.trim() || "PRO";

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

const virtualName = /(docker|wsl|vethernet|hyper-v|virtualbox|vmware|tailscale|utun|tun\d|tap\d)/i;
const candidates = Object.entries(networkInterfaces())
  .flatMap(([name, entries]) =>
    (entries ?? [])
      .filter(
        (entry) =>
          entry.family === "IPv4" &&
          !entry.internal &&
          !entry.address.startsWith("169.254."),
      )
      .map((entry) => ({ name, address: entry.address })),
  )
  .sort((a, b) => {
    const score = (candidate) => {
      let value = isPrivateIpv4(candidate.address) ? 10 : 0;
      if (candidate.address.startsWith("192.168.")) value += 30;
      else if (candidate.address.startsWith("10.")) value += 20;
      else if (candidate.address.startsWith("172.")) value += 10;
      if (virtualName.test(candidate.name)) value -= 100;
      return value;
    };
    return score(b) - score(a);
  });
const detectedHost = candidates[0]?.address ?? "127.0.0.1";
const publicHost = process.env.WAITING_PUBLIC_HOST?.trim() || detectedHost;

console.log(`Starting Waiting Entertainment local demo · plan=${plan}`);
console.log("Host Console: http://127.0.0.1:5175");
console.log("Broadcast:    http://127.0.0.1:5176");
console.log(`Phone QR host: http://${publicHost}:5177`);
if (publicHost === "127.0.0.1") {
  console.warn("No LAN IPv4 detected. Set WAITING_PUBLIC_HOST to the venue computer's LAN IP before phone testing.");
}

const result = spawnSync(npm, ["run", "dev"], {
  cwd: ROOT,
  env: { ...process.env, WAITING_PLAN: plan, WAITING_PUBLIC_HOST: publicHost },
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

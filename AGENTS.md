# AGENTS.md — Local deployment contract

## Mission

Get the repository running as a local venue demo. Do not redesign, migrate frameworks, split repositories, or replace working game code before the deployment checks pass.

## Required environment

- Node.js 22+
- npm 10+
- Git
- Host computer and phones on the same LAN

## Exact deployment sequence

From the repository root:

```bash
npm run setup
npm start
```

`npm run setup` is intentionally idempotent. It installs root dependencies, prepares the pinned Pilot Racer runtime under `games/pilot-racer/`, installs that runtime's production dependencies, and builds the project.

`npm start` launches the local demo with `WAITING_PLAN=PRO` unless the environment already provides another plan.

## Acceptance checks

Do not claim deployment success until all of these are true:

1. `http://127.0.0.1:3001/health` returns JSON with `"ok": true`.
2. `http://127.0.0.1:5175` opens Host Console.
3. Host Console game management shows:
   - `table-push-king`
   - `pilot-racer`
   - `sea-battle`
4. `http://127.0.0.1:5176` opens Broadcast Shell.
5. Creating a Table Push King round produces a join QR and a phone can reach the controller over the host LAN IP.
6. Starting Pilot Racer from the Hub makes port `9010` healthy.
7. Starting Sea Battle from the Hub makes port `9020` healthy.

## Do not do these during deployment

- Do not set `PILOT_RACER_DIR` unless intentionally overriding the bundled local runtime.
- Do not move game folders.
- Do not replace Vite, Socket.IO, Three.js, Rapier, or the Game Center architecture.
- Do not delete `.waiting/` while the host is using saved game settings.
- Do not interpret an unavailable process game before `npm run setup` as a code defect.

## LAN notes

Phone-facing URLs must use the host machine's LAN IP, not `localhost`. On Windows, allow Node.js through the private-network firewall when prompted. Avoid guest Wi-Fi/client-isolation networks because they can prevent phones from reaching the host.

## If something fails

Run:

```bash
npm run verify
```

Then inspect Host Console → 游戏管理 → runtime health/logs. Fix the concrete failing check first; do not perform a broad rewrite.

# Customer Demo Delivery Runbook — 2026-09

This branch is the frozen customer-demo baseline for Waiting Entertainment.

## Frozen code

- Hub: `release/customer-demo-2026-09`
  - baseline commit before this runbook: `c765db1ac24e8af916ee9fcc06c8f94b01d3eeba`
- Pilot Racer: `release/customer-demo-2026-09`
  - baseline commit: `112bfe18dff7065fc98f12ae85c9679f1527b216`

Do not merge experimental gameplay branches into this demo branch before the customer session.

Excluded from this demo baseline on purpose:
- Table Push King restaurant weapons V1
- Sea Battle V4 final 3D asset slot work
- additional destructible props / experimental combat features

The demo baseline favors stable end-to-end flow over feature count.

## Demo scope

The customer can be shown one integrated venue flow:

1. Host Console manages the waiting-entertainment session.
2. Guest scans QR and joins from a phone.
3. Host locks the lineup and starts the round.
4. Broadcast Shell shows the game and queue overlays.
5. Table Push King runs as the embedded 1–10 player party game.
6. Sea Battle runs as a bundled process package on port 9020.
7. Pilot Racer runs as the external process package on port 9010.
8. Host can inspect runtime status/logs and start/stop managed game processes.
9. Game settings can be edited, persisted locally, and applied on the next process start.
10. Runtime port/protocol conflicts and live runtime degradation are surfaced instead of silently failing.

## Recommended local layout

Keep the two repositories as siblings:

```text
<workspace>/
  waiting-entertainment-prototype/
  pilot-racer/
```

## First-time setup

Requirements:
- Node.js 22+
- npm 10+
- Mac/Windows host and phones on the same LAN for QR/mobile testing

Hub:

```bash
cd waiting-entertainment-prototype
git fetch
git checkout release/customer-demo-2026-09
npm install
npm run build
```

Pilot Racer:

```bash
cd ../pilot-racer
git fetch
git checkout release/customer-demo-2026-09
npm ci
npm run check
```

## Start on macOS / Linux

From `waiting-entertainment-prototype`:

```bash
PILOT_RACER_DIR="$(cd ../pilot-racer && pwd)" npm run dev
```

## Start on Windows PowerShell

From `waiting-entertainment-prototype`:

```powershell
$env:PILOT_RACER_DIR=(Resolve-Path "..\pilot-racer").Path
npm run dev
```

## Main URLs

| Surface | URL |
| --- | --- |
| Hub health | http://127.0.0.1:3001/health |
| Table Push King big screen | http://127.0.0.1:5173 |
| Table Push King phone | http://127.0.0.1:5174 |
| Host Console | http://127.0.0.1:5175 |
| Broadcast Shell | http://127.0.0.1:5176 |
| Guest join | http://127.0.0.1:5177 |
| Pilot Racer | http://127.0.0.1:9010/display |
| Sea Battle | http://127.0.0.1:9020 |

For phones, use the LAN IP shown by the host machine instead of `127.0.0.1`.

## Pre-demo acceptance

Before showing a customer, complete this short gate:

```bash
npm run build
node server/test/runtime-manager-smoke.mjs
node server/test/game-registry-smoke.mjs
node server/test/game-settings-store.mjs
node client/test/platform-ui-contract.mjs
```

Then verify:

- Host Console loads without red runtime errors.
- Broadcast Shell loads and can show recruiting / ready / live / result states.
- Guest join QR opens from one real phone.
- Table Push King: one real phone can join, move and complete a round.
- Sea Battle: Host starts the runtime and `/info` reports the expected protocol.
- Pilot Racer: Host sees the external package as configured and healthy.
- Starting a process on the wrong occupied port reports a conflict instead of killing the unrelated process.
- If a process game is stopped during a live round, Broadcast Shell shows a runtime interruption warning.
- Queue overlay still appears above the game/runtime layer.

## Recommended customer-demo order

### 1. Show the operating system, not the game first

Open Host Console at `:5175`.

Explain that one venue host controls:
- waiting queue
- game packages
- round lifecycle
- runtime health
- large-screen output

This establishes the commercial system before showing individual games.

### 2. Table Push King

Use this as the fastest "scan and play" proof:
- create/open round
- phone joins
- AI fills missing seats
- lock
- start
- play briefly
- show big-screen camera/replay/result

Do not enable experimental weapons in this demo baseline.

### 3. Sea Battle

Show the Game Management Center:
- select Sea Battle
- optionally change a safe setting
- save
- start/restart runtime
- show that the value is applied on the next process start
- open a round and show growth, broadside fire, respawn, monster/storm/bounty loop

Visual assets are still prototype-grade; sell the multiplayer/game-package architecture and gameplay loop, not final art quality.

### 4. Pilot Racer

Use the frozen Pilot Racer release branch.
Show:
- 8-slot race with AI fill
- phone driving
- TV director / free camera
- items and highlights
- external-process package controlled by the same Hub

### 5. Queue interruption

During or after a game, trigger a queue call so the customer sees that restaurant operations remain above the entertainment layer.

## Demo positioning

This delivery should be presented as a **commercial prototype / venue MVP**, not a final production deployment.

Ready to demonstrate:
- single venue
- single host
- LAN phones
- QR joining
- multiple game packages
- host operations
- big-screen broadcast
- AI fill
- runtime supervision
- queue overlay

Still requires real venue acceptance before production:
- 8 real-phone mixed iOS/Android test
- actual restaurant Wi-Fi stress
- Windows venue-host soak
- 10+ minute thermal/latency observation
- final 3D art polish

## Recovery rules during a customer session

If Pilot Racer is unavailable, continue with Table Push King + Sea Battle. The Hub itself remains demonstrable.

If a process package reports unhealthy:
1. open Game Management;
2. inspect runtime status/logs;
3. stop the managed process;
4. start it again;
5. refresh the Broadcast Shell only after health returns.

Do not change branches or pull experimental PRs on the demo machine immediately before the session.

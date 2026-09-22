# Running Waiting Entertainment Hub

## Requirements

- Node.js 22+
- npm 10+
- Host computer, big screen and guest phones on the same LAN

## Start

```bash
npm install
npm run dev
```

The local host exposes these surfaces:

| Surface | Address | Purpose |
| --- | --- | --- |
| Game display | `http://<HOST-LAN-IP>:5173` | Current embedded game's own broadcast renderer |
| Phone controller | `http://<HOST-LAN-IP>:5174` | Table Push King player view and controls |
| Host Console | `http://<HOST-LAN-IP>:5175` | Host-led rounds, game library, queue/calling |
| Broadcast Shell | `http://<HOST-LAN-IP>:5176` | Venue big-screen composition |
| Guest Join | `http://<HOST-LAN-IP>:5177/join/<ROUND_CODE>` | Ephemeral per-round signup |
| Authoritative server | `http://<HOST-LAN-IP>:3001` | GameSession + Hub API |

Use the LAN IP, not `localhost`, on any page that must be reachable from phones.

### Enable Pilot Racer as a local game package

Pilot Racer remains a separate game repository/runtime. Point the Hub at its local checkout before starting:

```bash
PILOT_RACER_DIR=/absolute/path/to/pilot-racer npm run dev
```

On the current development machine this can point at the existing Pilot Racer repository. The Hub does not copy or fork the game. It launches `node server.mjs` in that directory on port `9010`, health-checks `/info`, and stops only processes that the Hub itself started.

If `PILOT_RACER_DIR` is missing or invalid, Pilot Racer remains visible in the Base game library as **未配置本地游戏目录** and cannot create a hosted round.

### Enable Sea Battle

Sea Battle V1 now lives as an isolated Game Package under `games/sea-battle` and runs on port `9020`. It is intentionally registered as **Pro** content so Base stores do not automatically receive every new game.

Direct development:

```bash
npm run dev:sea
```

Hub-managed process mode:

```bash
WAITING_PLAN=PRO \
SEA_BATTLE_DIR=/absolute/path/to/waiting-entertainment-prototype/games/sea-battle \
npm run dev
```

The Hub launches `node server.mjs`, checks `/info` for protocol `sea-battle/1`, calls `/api/start` after roster lock/start, and embeds the dedicated display/player entrypoints. The current V2 gameplay loop is 3 minutes: steer + accelerate, collect supplies, choose one of three upgrades, automatic broadside cannons, collision/hit knockback, respawn after sinking, staged battle pacing, a shrinking storm finale, deep-sea monster events, and score ranking.

## Recommended venue flow

The normal hosted flow now starts from the platform surfaces rather than the legacy game QR.

1. Open the Host Console on `:5175`.
2. Open the venue Broadcast Shell full-screen on `:5176`.
3. The host selects an enabled game and clicks **开放本轮报名**.
4. The Broadcast Shell switches to **RECRUITING** and shows a fresh round QR/code.
5. Guests scan the QR and enter only a nickname. Queue tickets are not required.
6. For the embedded Table Push King, guest phones stay on the Hub waiting page until the host starts. For a process game such as Pilot Racer, locking the roster warms the external runtime and then sends registered guests into that game's own lobby.
7. The host locks the roster and clicks **主持人开局**.
8. Embedded games reset their authoritative session. Process games receive their package start action only after the runtime health check passes.
9. The Broadcast Shell switches to the selected game's display entrypoint. Queue calls remain a platform overlay.
10. When the host ends or cancels a process-game round, the Hub terminates the child process only if it was launched by RuntimeManager.

A new round gets a new code. Old round codes do not serve as permanent store join codes.

## Queue / calling behavior

Restaurant queue state is independent from entertainment rounds.

The Host Console can:

- add a waiting party;
- call a number;
- mark it passed;
- call it again;
- seat or cancel it.

A queue call appears as a high-priority overlay on the Broadcast Shell for about 10 seconds. The underlying game continues and is not paused.

A player may be a waiting guest, a seated diner, or someone invited by the host. The game flow never requires a queue ticket.

## Game library and licensing

The Host Console renders only games granted by the current store entitlements.

Current foundation:

- `table-push-king`: embedded runtime; host launch is wired.
- `pilot-racer`: Base external process Game Package v1. When `PILOT_RACER_DIR` is configured, roster lock warms the process, `/info` is health-checked, host start calls `/api/start`, and round finish shuts down the Hub-managed child process.
- `sea-battle`: Pro external process Game Package v1 on port `9020`; `SEA_BATTLE_DIR` enables Hub launch.
- Runtime status is exposed to the Host Console as embedded / not configured / stopped / starting / running / failed instead of treating a hidden URL as licensing or readiness.

Commercial tiers are represented by entitlements rather than separate application forks, so Base / Pro / Custom packages can share one host application.

### Runtime operator diagnostics

The Host Console now actively refreshes process-game health instead of showing only the last lifecycle state.

For every external Game Package the card provides:

- **检查运行时** — forces a health probe against the package's declared `healthPath` / `healthProtocol`;
- **查看日志** — shows the last Hub-captured stdout/stderr lines from the managed process;
- live state detection for a game that was started manually outside the Hub;
- ownership-safe behavior: a manually started healthy process is shown as running but remains `managed=false`, so the Hub will not kill it on shutdown.

The normal Host snapshot throttles health probes to avoid polling every external port on every 800ms UI refresh. A manual **检查运行时** always forces a fresh probe.

## Legacy direct game mode

For development or fallback, the original game surfaces remain available:

```text
http://<HOST-LAN-IP>:5173
http://<HOST-LAN-IP>:5174
```

Direct controller access remains compatible during migration. The Broadcast Shell embeds the game display with `?hub=1`, which hides the game's old permanent QR so the venue shows only the current Hub round QR.

## Local physics sandbox

Open:

```text
http://localhost:5173/?mode=local
```

Controls:

- WASD / arrows: move
- Space: attack
- R: restart

This browser-local mode is for physics tuning only.

## Automated validation

GitHub Actions verifies:

- all workspaces build;
- authoritative server health;
- existing Socket.IO join/input/disconnect smoke flow;
- platform CORS;
- one-active-round invariant;
- ephemeral round creation and signup;
- host lock/start/finish transitions;
- independent queue/calling transitions;
- Broadcast Shell state composition;
- ten-client concurrent combat stress;
- external RuntimeManager launch, health check, room-code propagation, start action and shutdown with a disposable fixture process;
- existing big-screen / phone visual preview workflow.

Real-device LAN, touch, heat and venue operations still require field validation.

## Phone diagnostics

For field testing:

```text
http://<HOST-LAN-IP>:5174/?debug=1
```

The diagnostics overlay shows FPS, render DPR, quality tier, LAN RTT, snapshot rate and active Socket.IO transport.

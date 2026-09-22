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

## Persistent local state

The Hub now keeps restaurant operational state in a small local JSON file instead of losing everything on restart.

Default:

```text
data/platform-state.json
```

Override it when packaging or testing:

```bash
WAITING_STATE_FILE=/absolute/path/store-001.json npm run dev
```

Persisted:

- queue tickets and queue-number sequence;
- per-store game enable/disable state;
- game display order;
- idle-screen media library and media order.

Not persisted as runnable state:

- active entertainment rounds;
- live player sockets;
- child game processes.

A host restart therefore restores store operations/content but requires a fresh game round/code. Writes use a temporary file + atomic rename.

## Game and media content management

The Host Console includes **游戏与媒体内容管理** below the game library.

Game controls are deliberately separate from licensing:

- entitlements decide whether a store owns a game;
- content settings decide whether that authorized game is currently shown/enabled at the venue;
- authorized games can be reordered without creating product forks.

Idle media supports:

- text/message cards;
- image URLs;
- video URLs;
- per-item duration;
- enable/disable;
- ordering and deletion.

When there is no active entertainment round, the Broadcast Shell automatically rotates enabled media. Restaurant queue calls still override the idle presentation.

For this phase, image/video assets are URL-based. Local upload/copy workflows can be layered onto the same MediaItem model later without changing the Broadcast Shell contract.

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
- `pilot-racer`: external process Game Package v1. When `PILOT_RACER_DIR` is configured, roster lock warms the process, `/info` is health-checked, host start calls `/api/start`, and round finish shuts down the Hub-managed child process.
- Runtime status is exposed to the Host Console as embedded / not configured / stopped / starting / running / failed instead of treating a hidden URL as licensing or readiness.

Commercial tiers are represented by entitlements rather than separate application forks, so Base / Pro / Custom packages can share one host application.

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
- queue numbering/state and content/media persistence across a simulated restart;
- game visibility and media-management API mutations;
- idle media Broadcast Shell visual preview;
- existing big-screen / phone visual preview workflow.

Real-device LAN, touch, heat and venue operations still require field validation.

## Phone diagnostics

For field testing:

```text
http://<HOST-LAN-IP>:5174/?debug=1
```

The diagnostics overlay shows FPS, render DPR, quality tier, LAN RTT, snapshot rate and active Socket.IO transport.

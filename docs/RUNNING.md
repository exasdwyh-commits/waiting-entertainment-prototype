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

## Recommended venue flow

The normal hosted flow now starts from the platform surfaces rather than the legacy game QR.

1. Open the Host Console on `:5175`.
2. Open the venue Broadcast Shell full-screen on `:5176`.
3. The host selects an enabled embedded game and clicks **开放本轮报名**.
4. The Broadcast Shell switches to **RECRUITING** and shows a fresh round QR/code.
5. Guests scan the QR and enter only a nickname. Queue tickets are not required.
6. Guest phones enter the controller in a waiting state; they do not take over a game slot yet.
7. The host locks the roster and clicks **主持人开局**.
8. The Hub changes the round to `running`, resets the embedded Table Push King GameSession, and starts its 3-second authoritative countdown.
9. Waiting phones connect and take over Bot slots.
10. When the host ends the Hub round, round-scoped phone controllers disconnect and AI immediately resumes control.

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
- `kart-racing`: Game Package v1 manifest exists, but the Host Console intentionally disables process launch until RuntimeManager is connected.

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
- existing big-screen / phone visual preview workflow.

Real-device LAN, touch, heat and venue operations still require field validation.

## Phone diagnostics

For field testing:

```text
http://<HOST-LAN-IP>:5174/?debug=1
```

The diagnostics overlay shows FPS, render DPR, quality tier, LAN RTT, snapshot rate and active Socket.IO transport.

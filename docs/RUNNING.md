# Running the prototype

## Requirements

- Node.js 22+
- npm 10+
- Big-screen computer and phones on the same LAN

## Start

```bash
npm install
npm run dev
```

This starts four workspaces/services through the monorepo:

- Big screen: `http://<HOST-LAN-IP>:5173`
- Phone controller: `http://<HOST-LAN-IP>:5174`
- Authoritative server: `http://<HOST-LAN-IP>:3001`
- Shared TypeScript protocol is built before development services start

Example:

```text
Big screen:       http://192.168.1.20:5173
Phone controller: http://192.168.1.20:5174
Server health:    http://192.168.1.20:3001/health
```

Use the LAN IP on the big-screen browser. If the screen is opened on `localhost`, the generated QR code will also contain `localhost` and will not work from another phone.

## Normal network mode

Open:

```text
http://<HOST-LAN-IP>:5173
```

The big screen connects to the authoritative server. Phones scan the QR code and automatically take over available Bot slots.

Current loop:

1. 3-second countdown
2. 60-second match
3. Push / knockdown / recovery / ledge catch / elimination
4. Live score and ranking
5. Final elimination highlight replayed twice at 0.45x
6. Winner display
7. Automatic next round

Players may leave at any time. Their slot returns to Bot control.

## Local physics sandbox

Open:

```text
http://localhost:5173/?mode=local
```

Controls:

- WASD / arrows: move
- Space: push
- R: restart

This mode runs Rapier in the browser and exists only for rapid physics tuning. It is not the target multiplayer architecture.

## Automated validation

GitHub Actions currently verifies:

- npm dependency installation
- shared package build
- big-screen client build
- phone controller build
- authoritative server build
- compiled Node + Rapier server starts and passes `/health`
- Socket observer receives the 8-player authoritative snapshot
- a controller can join and replace a Bot
- controller input is accepted
- disconnect returns the slot to AI

Real-device game-feel validation is still required.


## Mobile performance adaptation

The phone renderer automatically adapts render resolution when sustained frame rate drops.

- Target quality starts at up to 1.5 device pixel ratio.
- Sustained low FPS lowers render DPR in small steps.
- Sustained high FPS restores quality gradually.
- Input, server physics and match rules are never reduced.
- Only phone rendering resolution changes.

This exists specifically to keep the personal 3D view usable across a wide range of guest phones.

## Phone diagnostics

For field testing, open the phone controller with:

```text
http://<HOST-LAN-IP>:5174/?debug=1
```

A small diagnostics overlay shows:

- FPS
- current render DPR
- quality tier
- LAN round-trip time
- authoritative snapshot rate
- active Socket.IO transport

Normal guests do not see this panel.

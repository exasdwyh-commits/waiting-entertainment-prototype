# Waiting Entertainment Prototype

Waiting Entertainment is a browser-based public multiplayer game system for restaurant waiting areas.

The first game is **餐桌推推王 / Table Push King**: guests scan a QR code, use their phones as controllers, and fight on a shared big screen in a short physics match.

## Current MVP

Implemented:

- 8 persistent player slots
- 1-8 human players with automatic AI fill
- Single local GameSession with server-authoritative Rapier3D physics
- 60Hz host physics / 20Hz state snapshots
- Three.js big-screen renderer
- Phone personal 3D gameplay view + virtual joystick + one push button
- Human disconnect -> immediate AI takeover
- Phone refresh / wake / reconnect -> reclaim the same character
- Circular table arena
- Push / knockdown / recovery
- Simplified ledge catch and climb-back
- Falling elimination
- 3-second round countdown
- 60-second rounds
- Elimination scoring and live ranking
- Automatic winner selection and round restart
- QR join flow
- Player names on the big screen
- Dynamic spectator camera + impact shake
- Two-pass 0.45x slow-motion replay for the final elimination
- Eight replaceable local CC0 low-poly GLB character variants
- Centralized authoritative game-feel tuning config
- Symptom-driven tuning guide for real-device feedback
- Local physics tuning sandbox
- CI build, server runtime smoke test, and Socket end-to-end test

## Technology

- Three.js
- Rapier3D
- TypeScript
- Node.js
- Socket.IO
- Vite

## Run

Requirements: Node.js 22+, npm 10+, and phones on the same LAN as the host computer.

```bash
npm install
npm run dev
```

Open the big screen using the host computer's LAN address, for example:

```text
http://192.168.1.20:5173
```

Do **not** use `localhost` on the restaurant big screen if phones need to scan the QR code. The QR code points phones to port `5174` on the same host.

Services:

- Big screen: `:5173`
- Mobile controller: `:5174`
- Authoritative game server: `:3001`
- Health check: `:3001/health`

For the keyboard-only physics sandbox:

```text
http://localhost:5173/?mode=local
```

Controls: WASD / arrows to move, Space to push, R to restart.

## Product principle

This is not a traditional mobile game and not a SaaS-first product.

Priority order:

1. Game feel
2. Big-screen spectacle
3. Three-second learnability
4. Multiplayer stability
5. Personal phone-screen experience
6. AI fill
7. Fast creation of additional games
8. Commercial management systems

See `docs/RUNNING.md`, `docs/ARCHITECTURE.md`, `docs/TUNING.md`, and `docs/ROADMAP.md`.


## Topology boundary

The current product is intentionally **single restaurant / single host / single live game session**.

There is no matchmaking, public room browser, multi-room orchestration, or cloud-authoritative gameplay in the MVP. The phone is a personal game/control screen connected to the restaurant host over LAN.

# Running the prototype

## Requirements

- Node.js 22+
- npm 10+
- Same LAN for the big-screen computer and mobile controllers

## Install

```bash
npm install
```

## Run all services

```bash
npm run dev
```

Default services:

- Big screen prototype: http://localhost:5173
- Mobile controller: http://localhost:5174
- Controller/server endpoint: http://localhost:3001
- Server health: http://localhost:3001/health

## Current playable mode

The first playable build is deliberately local-first:

- Keyboard on the big-screen build controls the human character.
- WASD or arrow keys move.
- Space triggers a push burst.
- R restarts.
- Seven simple bots fill the table.
- Falling below the arena eliminates a player.
- Near-edge falls can enter a simplified ledge-hang recovery state.

The phone controller and authoritative room server are already runnable, but are not yet wired into the physics simulation. That integration is Phase 3/4 work.

## Replay foundation

The big-screen client stores a rolling snapshot buffer and marks elimination/final events. The buffer is the foundation for slow-motion highlight playback without video recording.

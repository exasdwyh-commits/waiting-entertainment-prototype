# Waiting Entertainment Prototype Development Roadmap

## Vision

Waiting Entertainment is a public multiplayer entertainment system for restaurants and waiting areas.

Core loop:

**Scan QR -> phone controls character -> 60-second shared-screen match -> highlight replay -> next round.**

Commercial/admin systems remain lower priority than game quality.

## Phase 0 - Research and product definition

**Status: Completed**

- Product positioning
- Open-source reference research
- Architecture direction
- MVP scope

## Phase 1 - Engineering foundation

**Status: Completed and CI validated**

- TypeScript monorepo
- `client / player / server / shared`
- Shared protocol
- Build pipeline
- Runtime smoke test
- Socket end-to-end test

## Phase 2 - Physics prototype

**Status: Implemented; real-world tuning pending**

- Three.js circular table
- Rapier rigid-body characters
- Movement and push impulses
- Knockdown and upright recovery
- Simplified ledge catch
- Falling elimination
- Local physics tuning sandbox

Exit condition: real users confirm the physical reactions are fun, readable and controllable.

## Phase 3 - Match loop

**Status: Implemented**

- 3-second countdown
- 60-second timer
- Elimination scoring
- Ranking
- Winner determination
- Automatic restart

## Phase 4 - Multiplayer architecture

**Status: Implemented; LAN field validation pending**

- Server-authoritative Rapier world
- 8 persistent slots
- Socket snapshots
- Human takeover of Bot slots
- Disconnect -> Bot takeover
- 1-8 human player model

## Phase 5 - Mobile controller

**Status: Implemented; phone compatibility validation pending**

- QR join
- Mobile web controller
- Virtual joystick
- Single push action
- Zero-install join flow

## Phase 6 - AI Bots

**Status: Implemented; behavior tuning pending**

- Nearest-target selection
- Chase
- Push
- Edge avoidance
- Auto recovery from ledge
- Human/Bot slot switching

## Phase 7 - Spectator and game-feel polish

**Status: In progress**

Implemented:

- Big-screen player labels
- Live ranking
- Result presentation
- Rolling snapshot history
- Final elimination slow-motion replay
- Two-pass replay with second close camera

Next:

- Better low-poly characters
- Stronger hit VFX and sound
- Camera director
- More varied Bot personalities
- Better ledge animation/readability
- Game-feel tuning from real players

## Phase 8 - Waiting Engine

**Status: Future**

Extract reusable systems so additional games share:

- Input
- Sessions
- Network
- AI fill
- Match lifecycle
- Replay/events
- Deployment runtime

Candidate games:

- Table Push King
- Sea Battle
- Kart Racing
- Party Arena

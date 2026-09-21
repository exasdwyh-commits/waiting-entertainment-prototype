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
- Ledge catch with timed rescue window
- Staged physical climb-back instead of instant teleport
- Failed ledge rescue -> ragdoll fall/recovery
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

- One permanent local GameSession; no room/matchmaking layer
- Server-authoritative Rapier world
- 60Hz host physics / 20Hz snapshots
- 8 persistent slots
- Human takeover of Bot slots
- Disconnect -> immediate Bot takeover
- Stable phone session -> reclaim same character after refresh/reconnect
- 1-8 human player model

## Phase 5 - Mobile controller

**Status: Implemented; phone compatibility validation pending**

- QR join
- Personal lightweight Three.js gameplay view
- Follow camera focused on the player's own character
- Camera-relative joystick mapping so controls remain intuitive when the personal camera moves
- Mobile web controller overlay
- Virtual joystick
- Single push action + haptics
- Authoritative server-driven push cooldown indicator
- Edge danger ring and dedicated ledge camera
- Eliminated phone -> automatic spectator camera
- Eliminated controls visually disable until next round
- Final 10-second tension treatment on phone
- Personal procedural audio feedback
- Zero-install join flow

## Phase 6 - AI Bots

**Status: Implemented; behavior tuning pending**

- Target-aware selection with anti-dogpile penalty
- Four Bot behavior profiles: bruiser / survivor / opportunist / flanker
- Personality-specific edge caution, orbiting, target bias, movement and push cadence
- Push only when the Bot is actually facing its selected target
- Chase
- Edge avoidance
- Auto recovery from ledge
- Human/Bot slot switching

## Phase 7 - Spectator and game-feel polish

**Status: In progress**

Implemented:

- Big-screen player labels
- Persistent color rings: humans emphasized, AI subdued
- AI-to-human takeover pulse on the big screen
- Live human/AI participant count
- Phone player ring matches the same fighter color
- Live ranking
- Result presentation
- Rolling snapshot history
- Full-round replay history
- Automatic best-elimination highlight selection
- Up to two post-match highlight clips
- Final elimination slow-motion replay
- Final elimination two-pass replay with second close camera

Implemented additionally:

- Vendored CC0 low-poly GLB character placeholder
- Replaceable CharacterVisual layer
- Animation-state adapter
- Dynamic spectator framing
- Impact camera shake
- Impact-driven FOV punch on big screen and personal phone view
- Lightweight push-hit shard VFX
- Procedural arcade audio (no external audio assets)
- Ledge spectator callouts and climb-focused camera
- Final 10-second big-screen camera push-in + timer pulse

Next:

- More advanced hit VFX / particles
- More advanced camera director
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

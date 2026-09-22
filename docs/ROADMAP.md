# Waiting Entertainment Prototype Development Roadmap

## Vision

Waiting Entertainment is a public multiplayer entertainment system for restaurants and waiting areas.

Core loop:

**Scan QR -> phone controls character -> ~180-second shared-screen physics brawl -> highlight replay -> next round.**

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

## Combat parity program

**Current strategic priority**

See `docs/PARTY_ANIMALS_PARITY_MATRIX.md`.

Before adding broad platform features, close the main physics-party combat gaps:

- Sprint + Stamina
- Punch / Heavy Strike
- persistent Grab / Carry / directional Throw
- Struggle / breakout
- Jump / Kick / Headbutt / Dropkick
- HP / KO / Wake-up
- restaurant-themed weapons and pickup/throw
- stronger active-ragdoll presentation
- smoke / squash-stretch / trails / combat SFX
- ~180-second staged brawl structure

## Phase 2 - Physics prototype

**Status: Implemented; real-world tuning pending**

- Three.js circular table
- Rapier rigid-body characters
- Movement and push impulses
- Knockdown and upright recovery
- Impact-driven balance loss: stronger hits create longer, weaker recovery
- Low balance reduces movement control and upright assistance
- Near-edge support naturally weakens, increasing wobble/fall risk
- Balance gradually returns instead of snapping instantly to full control
- Ledge catch with timed rescue window
- Staged physical climb-back instead of instant teleport
- Failed ledge rescue -> ragdoll fall/recovery
- Pre-Final falling respawn + permanent Final Chaos elimination
- Local physics tuning sandbox

- Centralized `GAME_TUNING` for movement / push / balance / ledge feel
- Startup validation prevents invalid tuning ranges from reaching runtime
- Symptom-driven `docs/TUNING.md` maps field feedback to parameters

Exit condition: real users confirm the physical reactions are fun, readable and controllable.

## Phase 3 - Match loop

**Status: Implemented; combat-stage tuning pending**

- 3-second countdown
- 180-second authoritative round
- Opening / Brawl / Danger / Final Chaos stage broadcast
- Pre-Final respawn pacing keeps the full three-minute brawl alive
- Final Chaos switches to permanent elimination / last-standing resolution
- Fall scoring across the full match; permanent elimination only in Final Chaos
- Ranking
- Winner determination
- Automatic restart

## Phase 4 - Multiplayer architecture

**Status: Implemented; LAN field validation pending**

- One permanent local GameSession; no room/matchmaking layer
- Server-authoritative Rapier world
- 60Hz host physics / 20Hz snapshots
- 10 persistent slots
- Human takeover of Bot slots
- Disconnect -> immediate Bot takeover
- Stable phone session -> reclaim same character after refresh/reconnect
- 1-10 human player model

## Phase 5 - Mobile controller

**Status: Implemented; phone compatibility validation pending**

- QR join
- Personal lightweight Three.js gameplay view
- Follow camera focused on the player's own character
- Camera-relative joystick mapping so controls remain intuitive when the personal camera moves
- Mobile web controller overlay
- Camera-relative virtual joystick with outer-zone Sprint
- Server-authoritative Stamina HUD
- Large contextual Attack button: Punch / Heavy Strike / Throw
- Dedicated hold-to-Grab button with Carry state
- Contextual haptics by attack class
- Authoritative server-driven push cooldown indicator
- Edge danger ring and dedicated ledge camera
- Eliminated phone -> automatic spectator camera
- Eliminated controls visually disable until next round
- Final 10-second tension treatment on phone
- Personal procedural audio feedback
- Adaptive phone render resolution based on sustained FPS
- Hidden `?debug=1` diagnostics: FPS / DPR / LAN RTT / snapshot rate / transport
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

## Combat parity Phase A1

**Status: Implemented in current combat branch; field tuning pending**

- Sprint + Stamina
- Punch / Sprint Heavy Strike
- Persistent Grab / Carry
- Manual directional Throw
- Bot vulnerable-target grab behavior
- 180-second staged match
- Graded combat camera/haptics/audio
- Heavy-hit smoke and squash/stretch V1

Remaining Phase A:
- Struggle / breakout
- Jump / Kick / Headbutt / Dropkick
- HP / KO / Wake-up

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

- Eight-model CC0 low-poly character roster
- Slot-specific character variants instead of eight identical fighters
- Replaceable CharacterVisual asset layer
- Animation-state adapter
- Dynamic spectator framing
- Impact camera shake
- Impact-driven FOV punch on big screen and personal phone view
- Presentation-only hit-stop on strong impacts; authoritative physics never pauses
- Lightweight push-hit shard VFX
- Procedural arcade audio plus crowd-like reaction bursts (no external audio assets)
- Ledge spectator callouts and climb-focused camera
- Final 10-second big-screen camera push-in + timer pulse
- Modular low-poly restaurant environment around the arena
- Restaurant floor, rug, seating, background tables, wall dressing, pendant lighting and arena sign
- Lightweight matching floor/pedestal treatment on the phone personal view

Next:

- More advanced hit VFX / particles
- More advanced camera director
- Better ledge animation/readability
- Production-quality character art replacement after gameplay lock
- Game-feel tuning from real players

## Phase 8 - Waiting Entertainment Hub

**Status: In progress — operational shell + external runtime integration implemented**

Extract reusable platform systems while keeping each game's simulation independent:

- Game Manifest / Game Registry
- Store entitlements for Base / Pro / Custom content
- Host-created ephemeral rounds and per-round join codes
- Queue/calling domain independent from game participation
- Broadcast Shell state + queue overlay
- Runtime Manager for embedded and external-process games
- Shared session/network conventions where they are genuinely reusable
- Deployment runtime and local health checks

Implemented:

- Shared platform contracts
- Entitlement-aware registry
- Host-created RoundManager with fresh per-round join codes
- Independent QueueService
- Broadcast state composition + restaurant queue overlay
- Host Console on `:5175`
- Broadcast Shell on `:5176`
- Guest per-round signup on `:5177`
- Local `/api/platform/*` host APIs
- Game Package Manifest v1 specification
- Embedded Table Push King hosted-round gating
- RuntimeManager for external local game processes
- Runtime readiness / failure state surfaced in the Host Console
- Process warmup on roster lock, health protocol verification, start action and managed shutdown
- Pilot Racer adapter via `PILOT_RACER_DIR`

Next:

- Persist queue + store/content settings across Hub restarts
- Media library / idle attract playlist
- Game enable/disable/order controls separate from license entitlements
- Signed per-round admission tokens for external game packages
- Package discovery from installed manifests instead of only built-in manifests
- Field validation with real phones, restaurant TV and host workflow.

Candidate games:

- Table Push King
- Sea Battle
- Kart Racing
- Party Arena

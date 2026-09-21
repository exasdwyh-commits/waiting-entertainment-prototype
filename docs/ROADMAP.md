# Waiting Entertainment Prototype Development Roadmap

## Vision

Waiting Entertainment is a public multiplayer entertainment system for restaurants and waiting areas.

The first objective is not monetization or account systems. The priority is proving that a short, physical, social multiplayer game can attract people in a public environment.

Core experience:

Scan QR -> control character -> play 60 seconds -> audience watches -> next round.

---

# Phase 0 - Research and Product Definition

Status: Completed

Goals:

- Define product positioning
- Study reference projects
- Decide technical direction
- Establish MVP scope

Outputs:

- Architecture document
- Product definition
- Development roadmap

---

# Phase 1 - Engineering Foundation

Goal:

Create a scalable game project foundation.

Tasks:

- Setup TypeScript monorepo
- Setup client/player/server/shared packages
- Configure build system
- Define shared network protocol
- Add development documentation

Acceptance:

- Project installs successfully
- All packages compile
- Basic server and client can communicate

---

# Phase 2 - Single Player Physics Prototype

Goal:

Validate the core fun of Table Push King.

Features:

- Three.js arena
- Circular table
- Low poly character
- Rapier physics
- Movement
- Push collision
- Knockdown
- Recovery
- Falling elimination

Acceptance:

A single player can push physics characters and create fun reactions.

---

# Phase 3 - Game Rule Prototype

Goal:

Turn physics into a playable match.

Features:

- 60 second timer
- Spawn system
- Winner detection
- Camera system
- Basic UI
- Match restart

Acceptance:

A complete local match can run repeatedly.

---

# Phase 4 - Multiplayer Architecture

Goal:

Add real-time multiplayer.

Features:

- Authoritative server
- Room management
- State synchronization
- Player sessions
- Reconnect handling

Acceptance:

2-8 clients can join and play together.

---

# Phase 5 - Mobile Controller

Goal:

Create restaurant-friendly interaction.

Features:

- QR join flow
- Mobile web controller
- Virtual joystick
- Push button
- Player nickname

Acceptance:

A guest can join within seconds without installation.

---

# Phase 6 - AI Bot System

Goal:

Keep games full even with few players.

Features:

- Bot replacement
- Target selection
- Approach behavior
- Attack behavior
- Edge avoidance

Acceptance:

1 human player can start an entertaining 8-player match.

---

# Phase 7 - Experience Polish

Goal:

Make the game suitable for public display.

Features:

- Better characters
- Animations
- Sound effects
- Victory moments
- Spectator camera
- Branding layer

---

# Phase 8 - Future Game Platform

Goal:

Evolve from one game into Waiting Engine.

Possible games:

- Table Push King
- Sea Battle
- Kart Racing
- Party Arena

Shared systems:

- Input
- Physics
- Network
- Room system
- AI framework
- Deployment runtime

# Waiting Entertainment Prototype Autonomous Development Plan

This project will proceed continuously according to the following development order.

## Development Principle

Prioritize gameplay validation over platform features.

Order:

1. Fun physics
2. Public screen experience
3. Fast player onboarding
4. Multiplayer stability
5. AI replacement
6. Commercial deployment support

## Phase 1 - Foundation

Goal:
Create a clean game engineering foundation.

Tasks:

- Setup monorepo
- Create client/player/server/shared packages
- Add TypeScript configuration
- Define network message contracts
- Document development workflow

## Phase 2 - Physics Prototype

Goal:
Make the first playable physical prototype.

Tasks:

- Three.js scene
- Rapier physics
- Character body
- Movement
- Push impulse
- Knockdown
- Recovery
- Fall detection

Success:
A player can push another character off a table.

## Phase 3 - Core Game Loop

Tasks:

- Round system
- Countdown
- Timer
- Winner detection
- Restart loop
- Simple UI

## Phase 4 - Multiplayer

Tasks:

- Authoritative server
- Room management
- State synchronization
- Player sessions

## Phase 5 - Mobile Controller

Tasks:

- QR join flow
- Touch joystick
- Push button
- Reconnect handling

## Phase 6 - AI Bots

Tasks:

- Target selection
- Chase behavior
- Push behavior
- Edge avoidance
- Player replacement after disconnect

## Phase 7 - Experience Polish

Tasks:

- Camera direction
- Spectator view
- Character feedback
- Audio
- Victory animation

## Phase 8 - Waiting Engine

Extract reusable systems:

- Match engine
- Controller system
- Room system
- Physics layer
- Game modules

Future games:

- Table Push King
- Sea Battle
- Racer
- Party Battle

# Waiting Entertainment Prototype Architecture

## Product Position

Waiting Entertainment is a public multiplayer entertainment system, not a traditional mobile game.

Primary goals:

1. Instant participation
2. Large screen spectacle
3. Short competitive rounds
4. Physics-driven fun

## Core Architecture

```
Big Screen Client
        |
   WebSocket
        |
 Game Server
        |
 ----------------
 |              |
Players       AI Bots
```

## Monorepo Direction

```
client/
  Large screen Three.js game

player/
  Mobile browser controller

server/
  Authoritative game server

shared/
  Protocols and shared types
```

## Technical Principles

### Server authoritative

Server controls:

- Physics state
- Collision results
- Match state
- AI behavior
- Scoring

Client controls:

- Input
- Rendering
- Animation interpolation

## Physics Direction

MVP uses a simplified hybrid ragdoll approach:

NORMAL
-> HIT
-> RAGDOLL
-> RECOVER

Future extension:

- Active Ragdoll
- Ledge Catch
- Advanced recovery

## First Game

Table Push King:

- Circular table arena
- 2-8 players
- 60 second rounds
- Last survivor wins

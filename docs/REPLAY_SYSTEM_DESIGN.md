# Highlight Replay System Design

## Goal

Waiting Entertainment should create memorable public entertainment moments, not only determine winners.

Classic moments should be replayable like sports highlights.

## Concept

During gameplay the server records important events:

- Heavy collision
- Player pushed near edge
- Ledge catch
- Recovery comeback
- Final elimination
- Winner moment

## Event Recording

MVP does not record video.

Instead record gameplay state snapshots:

```
ReplayEvent
  timestamp
  players snapshot
  physics state
  camera suggestion
  event type
```

## Replay Flow

```
Normal Match

   |
   | detect highlight event
   v
Save snapshot buffer

   |
   v
Slow motion replay

   |
   v
Return to live game
```

## Camera System

Future:

- Follow target player
- Dynamic zoom
- Arena overview
- Multiple angles

## Priority

Not required for first physics prototype.

Should be considered during architecture because physics snapshots and event tracking are easier to add early.

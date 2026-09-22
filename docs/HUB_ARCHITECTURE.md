# Waiting Entertainment Hub Architecture

## Product definition

Waiting Entertainment Hub is a host-led, big-screen restaurant entertainment system.

It has two independent business domains:

1. **Restaurant operations** — queue ticketing, calling, pass/seat state, store settings.
2. **Entertainment** — game library, licensing, host-created rounds, temporary join codes, runtime launch, broadcast presentation.

A queue ticket is never required to join a game. A diner who is already seated may join a round, while a waiting guest may ignore games entirely.

## Core topology

```text
Waiting Entertainment Hub
├─ Restaurant Core
│  └─ QueueService
├─ Entertainment Core
│  ├─ GameRegistry
│  ├─ StoreLicense / Entitlements
│  ├─ RoundManager
│  └─ RuntimeManager (next phase)
├─ Host Console (next phase)
└─ Broadcast Shell
   ├─ Game presentation
   └─ Queue call overlay
```

## Round model

Games are host-led and use **ephemeral round codes**.

```text
Host selects game
  -> create round
  -> recruiting
  -> players scan the current round QR
  -> host locks roster
  -> start
  -> running
  -> finish
  -> result / highlights
```

The round code expires. A screenshot from an old round must not behave like a permanent store join code.

Round lifecycle:

```text
recruiting -> locked -> running -> finished
     |          |         |
     +----------+---------+-> cancelled

recruiting -> expired
locked -> recruiting
```

## Queue model

Queue lifecycle is separate:

```text
waiting -> called -> seated
   |         |
   |         +-> passed -> called
   |         +-> waiting
   +-> cancelled
```

A game player may optionally carry a `queueTicketId` for future convenience features, but game admission and gameplay never depend on queue state.

## Licensing

The platform is one host application with entitlement-driven content.

Example grants:

```text
BASE
  game:table-push-king

PRO
  game:table-push-king
  game:kart-racing
  updates:pro

CUSTOM
  explicit per-store game/theme grants
```

The exact commercial bundle can change without changing game runtime code.

## Broadcast composition

The big screen is a platform shell, not a game-owned page.

Primary modes:

```text
IDLE_MEDIA
RECRUITING
READY
COUNTDOWN
LIVE_GAME
RESULT
HIGHLIGHT
```

Queue calling is an independent high-priority overlay rendered above any primary mode. It does not pause the game.

## Current platform API

All endpoints are local-host APIs under `/api/platform`.

- `GET /api/platform` — complete platform snapshot.
- `GET /api/platform/games` — authorized and installed registry view.
- `GET /api/platform/rounds` — round list.
- `POST /api/platform/rounds` — create a host-led round.
- `POST /api/platform/join/:code` — join a recruiting round.
- `POST /api/platform/rounds/:id/lock`
- `POST /api/platform/rounds/:id/reopen`
- `POST /api/platform/rounds/:id/start`
- `POST /api/platform/rounds/:id/finish`
- `POST /api/platform/rounds/:id/cancel`
- `GET /api/platform/queue`
- `POST /api/platform/queue`
- `POST /api/platform/queue/:id/call`
- `POST /api/platform/queue/:id/return`
- `POST /api/platform/queue/:id/pass`
- `POST /api/platform/queue/:id/seat`
- `POST /api/platform/queue/:id/cancel`
- `GET /api/platform/broadcast`

## First implementation boundary

This foundation intentionally keeps state in memory and does not yet launch external processes.

The next implementation phase should add:

1. Host Console UI.
2. Broadcast Shell UI.
3. RuntimeManager process lifecycle and health checks.
4. Persistent local store/queue configuration.
5. Signed/short-lived join tokens behind the six-character round code.
6. Game Package discovery from manifests instead of only built-in manifests.
7. A pilot-racer adapter as the first external-process package.

The existing Table Push King game loop remains the authoritative gameplay path during this migration.

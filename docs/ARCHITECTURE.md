# Waiting Entertainment Prototype Architecture

## Product topology

Waiting Entertainment is a **single-site local party game appliance**.

It is not an Internet matchmaking platform and does not need room discovery, lobbies, multi-room orchestration, or cloud-authoritative gameplay.

The restaurant has one host computer:

```
Restaurant Host Computer
├─ Authoritative GameSession
│  ├─ Rapier physics @ 60Hz
│  ├─ 8 persistent player slots
│  ├─ AI takeover
│  ├─ score / timer / rules
│  └─ event + replay source data
│
├─ Big Screen
│  ├─ Three.js spectator rendering
│  ├─ camera director
│  ├─ ranking
│  └─ slow-motion replay
│
└─ LAN / Wi-Fi
   ├─ Phone 1 personal game view + controls
   ├─ Phone 2 personal game view + controls
   └─ ...
```

## One permanent game session

There is no user-facing concept of creating or finding a room.

Starting the restaurant host starts the game session.

The server owns eight persistent physical character slots:

```
P1 P2 P3 P4 P5 P6 P7 P8
```

All slots start under AI control.

When a guest scans the QR code, that phone takes control of an available AI slot.

When the phone disconnects, AI immediately takes over the **same physical character** so the match never blocks.

A stable browser `sessionId` is retained briefly. If the guest refreshes, wakes the phone, or reconnects after Wi-Fi interruption, the same phone reclaims the same character.

## Authority

The restaurant host is the single source of truth.

### Host owns

- Rapier world
- collisions and impulses
- player states
- AI decisions
- eliminations
- score
- round lifecycle
- replay event markers

### Big screen owns only presentation

- interpolation
- camera
- HUD
- ranking
- slow-motion playback of recorded snapshots
- visual/audio effects

### Phone owns only input and a personal presentation

- personal follow camera
- lightweight Three.js scene
- touch joystick
- push button
- haptics
- player-specific status

The phone does **not** run authoritative physics.

## Simulation and networking

- Physics: 60Hz on the host
- State snapshots: 20Hz
- Important events: emitted immediately
- Phone input: event-driven / pointer updates
- Big screen and phones interpolate state locally

This is deliberately simpler than Internet competitive-game prediction/rollback because all gameplay devices are expected to be on the same restaurant LAN.

## Character architecture

Physics and visuals are independent.

```
Rapier rigid body
      │
      ├─ authoritative position / rotation / state
      │
      ▼
CharacterVisual
      ├─ GLB model
      ├─ animation mixer
      └─ capsule fallback
```

The current character is a temporary CC0 low-poly GLB. Replacing `character.glb` does not require changing gameplay physics or networking.

## Physical character direction

Current MVP uses a single-body assisted-physics character:

- dynamic capsule body
- physical hit impulses
- temporary loss of control after strong hits
- continuous upright assistance
- recovery state
- timed ledge catch
- staged assisted climb-back
- failed rescue returns to ragdoll/fall

This intentionally sits between a conventional character controller and a full articulated Active Ragdoll.

Future upgrade path:

1. improve balance torque and stumble thresholds
2. split visual limbs from the central gameplay body
3. optional articulated upper body
4. optional full Active Ragdoll if playtesting proves the extra complexity is worthwhile

## First game: Table Push King

- 1-8 human guests
- AI fills unused slots
- circular tabletop arena
- three-second countdown
- 60-second rounds
- movement + one push action
- knockdown / recovery
- ledge catch
- falling elimination
- score and ranking
- automatic next round
- final-elimination slow-motion replay


## Game-feel synchronization

Important control feedback is authoritative where desynchronization would be noticeable.

- Push cooldown is calculated on the host and included in player snapshots.
- Phone UI renders the remaining host cooldown instead of starting an independent local timer.
- Ledge rescue is a host-owned state transition: `EDGE_HANG -> CLIMBING -> RECOVERING`.
- Camera, VFX, haptics and procedural audio are client presentation only and never decide gameplay.

# Reference Project Integration

The reference repositories are treated as engineering research. We copy concepts aggressively but avoid creating an unnecessary license dependency in the commercial game.

## Stick & Steel

License: MIT.

Adopted concepts:

- Rapier as the physical source of truth
- higher-frequency physics than network snapshots
- physical knockdown rather than animation-only knockdown
- assisted recovery rather than teleport-only recovery
- ledge catch as a dramatic state
- camera behavior reacting to physical events
- mobile input cancellation when the page hides or loses focus
- impact-driven feedback
- stagger temporarily weakening movement and physical assistance
- gradual recovery of physical support rather than an instant upright reset
- support weakening close to / outside the playable platform

Waiting implements these ideas independently with a single central dynamic body and a normalized `balance` scalar. Strong impacts reduce balance, which weakens movement and upright torque; balance then recovers over time. The visual layer temporarily stops forcing a clean upright facing pose while balance is low, exposing the actual Rapier tilt. This keeps the architecture much simpler than Stick & Steel's articulated multi-body fighter while preserving part of the same physical-comedy behavior.

Full articulated ragdoll remains an upgrade path rather than an MVP dependency.

## Couch Kit / Buzz TV Party Game

License: MIT.

Adopted concepts:

- local-first topology
- host as the single source of truth
- phone as controller
- QR join
- stable phone identity across refresh/reconnect
- immediate session recovery
- controller development independent of the display

Not adopted for the MVP:

- Internet relay
- cross-network rooms
- Android TV native host
- room-code discovery

Those solve a different deployment problem than the current restaurant host-PC product.

## multiplayer-racer

License: GPLv3.

Used as architecture research only.

Useful ideas incorporated through independent implementation:

- big-screen host + phone interaction split
- clear player identity
- secure socket-to-player ownership rather than trusting a player ID supplied by the phone
- controller sleep/reconnect as a first-class failure case

No GPL source is copied into this repository.

## Aetheria

No explicit repository LICENSE was confirmed during review, so it is treated as research-only.

Useful ideas:

- separate game systems instead of one giant Three.js file
- avoid unnecessary allocations in hot render loops
- server state updates at a lower rate than render frames
- asset/system organization that remains friendly to AI-assisted development

## Pastel Nuketown

No explicit repository LICENSE was confirmed during review, so it is treated as research-only.

Useful ideas:

- separate small latency-sensitive events from normal state snapshots
- host-authoritative state with visual interpolation
- network behavior that remains stable when a participant disappears

## Asset policy

Only assets with explicit commercial-compatible licensing are vendored.

The temporary character model is from Kenney's low-poly character assets and is CC0 1.0. It is isolated behind `CharacterVisual` so production art can replace it without rewriting gameplay.

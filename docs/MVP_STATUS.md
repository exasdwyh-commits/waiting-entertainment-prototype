# MVP implementation status

## Implemented

- Monorepo structure for big screen, phone controller, server, and shared protocol
- Three.js + Rapier local physics tuning sandbox
- Authoritative Rapier room on the Node server
- 8 persistent slots with human takeover and Bot fallback
- Touch joystick + push controller
- Circular table arena
- Push, knockdown, recovery, simplified ledge catch, elimination
- 60-second rounds and automatic restart
- Big-screen network renderer
- Player labels, timer, join QR and connection status
- Rolling snapshot history
- Two-pass slow-motion replay for final eliminations

## Validation purpose

This branch exists to force a pull-request CI build of the entire workspace. It should only be merged after the repository builds cleanly.

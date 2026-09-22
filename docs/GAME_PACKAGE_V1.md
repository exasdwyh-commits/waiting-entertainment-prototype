# Game Package Manifest v1

A game is content managed by Waiting Entertainment Hub. It must not own restaurant queue state or permanent store identity.

## Required manifest

```json
{
  "schemaVersion": 1,
  "id": "kart-racing",
  "name": "极速等位赛",
  "version": "0.1.0",
  "category": "racing",
  "summary": "1-8 人手机驾驶 + 大屏导播",
  "players": { "min": 1, "max": 8 },
  "runtime": {
    "kind": "process",
    "healthPath": "/info",
    "command": ["node", "server.mjs"],
    "workingDirectoryEnv": "PILOT_RACER_DIR"
  },
  "entrypoints": {
    "display": "http://{host}:9010/display",
    "player": "http://{host}:9010/"
  },
  "capabilities": {
    "aiFill": true,
    "hotJoin": true,
    "reconnect": true,
    "highlights": true,
    "replay": false
  },
  "round": {
    "joinPolicy": "ephemeral-code",
    "codeTtlSeconds": 300,
    "lateJoin": false
  },
  "commercial": {
    "tier": "base",
    "entitlements": ["game:kart-racing"]
  }
}
```

## Contract rules

### 1. Round identity belongs to the Hub

The Hub creates the round and the public join code. Games may maintain internal match/session IDs, but those are implementation details.

### 2. Queue state is optional context

A player may carry an optional queue ticket reference. Games must never require it.

### 3. Entitlements are checked before runtime launch

The Hub decides whether a store is allowed to launch a package. A hidden URL must not be treated as licensing.

### 4. Display and player are separate entrypoints

The big screen is composed by the Hub Broadcast Shell. The game display is embedded/routed as the primary content layer.

### 5. Runtime types

- `embedded` — runtime is part of the main application process.
- `process` — Hub launches and health-checks an external local process.

### 6. Commercial tier is metadata, not the lock itself

`base / pro / custom` helps the content manager present the library. Actual access is determined by entitlement grants.

## Future v1-compatible extensions

These may be added as optional fields without changing `schemaVersion`:

- cover art and attract video
- localized title/summary
- game-specific settings schema
- content packs / theme packs
- minimum host hardware profile
- runtime port allocation hints
- update channel
- custom brand package metadata

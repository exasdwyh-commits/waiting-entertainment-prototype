# Game Center Plugin Architecture V1

## Current behavior

Waiting Entertainment now treats games as installable Game Packages.

The local plugin root is:

```text
game-center/installed/
```

A package is discovered when its directory contains a valid `game-package.json`.

The Hub loads this directory at startup. The Host Console also provides **重新扫描游戏目录**, so a package can be added or changed without editing Hub source code. Rescan is blocked while a round is recruiting, locked, or running.

Current installed packages:

- `pilot-racer`
- `sea-battle`
- `table-push-king`

If the plugin directory is missing or empty, the Hub falls back to the built-in safe baseline. If an installed manifest is invalid, startup falls back to the safe baseline; a manual rescan rejects the invalid package and keeps the current registry unchanged.

## Package contract

Every game package directory contains at least:

```text
game-center/installed/<game-id>/
└── game-package.json
```

A bundled game may additionally keep its runtime inside the same directory and set `runtime.bundledPath` to that directory. External games may use `runtime.workingDirectoryEnv`.

Minimal valid shape:

```json
{
  "schemaVersion": 1,
  "id": "example-game",
  "name": "Example Game",
  "version": "0.1.0",
  "category": "party",
  "summary": "Short description shown in the Host game center.",
  "players": { "min": 1, "max": 8 },
  "runtime": {
    "kind": "process",
    "healthPath": "/info",
    "healthProtocol": "example-game/1",
    "command": ["node", "server.mjs"],
    "bundledPath": "game-center/installed/example-game",
    "port": 9030,
    "startPath": "/api/start"
  },
  "entrypoints": {
    "display": "http://{host}:9030/display",
    "player": "http://{host}:9030/"
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
    "entitlements": ["game:example-game"]
  }
}
```

## Discovery pipeline

```text
game-center/installed/*
        ↓
GamePackageScanner
        ↓
Game manifest validation
        ↓
GameRegistryManager
        ↓
GameRegistry
        ↓
PlatformHub
        ↓
Host Console / Broadcast / RuntimeManager
```

No game ID is added to Host Console manually. The UI renders `PlatformSnapshot.allGames` and therefore follows the registry automatically.

## Validation rules

The Hub rejects packages with invalid or conflicting contracts, including:

- invalid or duplicate game ID;
- invalid player range;
- non-portable LAN entrypoints;
- missing game entitlement;
- process runtime without command, port or health protocol;
- duplicate process ports;
- invalid bundled path;
- invalid settings schema.

## Current migration

### Table Push King

Registered through:

```text
game-center/installed/table-push-king/game-package.json
```

It remains an embedded runtime for now, so existing gameplay/server code does not need to move before the customer demo.

### Pilot Racer

Registered through the Game Center manifest and continues to use `PILOT_RACER_DIR` for its external repository/runtime.

### Sea Battle

Registered through the Game Center manifest and continues to use its bundled runtime at `games/sea-battle`.

This deliberately separates **package registration** from **physical source relocation**. Existing stable games do not need risky file moves just to become plugins.

## Adding a new local game

1. Create `game-center/installed/<game-id>/`.
2. Put a valid `game-package.json` inside.
3. Put the runtime in the package directory, or configure a supported external working directory.
4. Open Host Console → 游戏管理.
5. Click **重新扫描游戏目录**.
6. The new package appears automatically in the management center.

Commercial entitlement still applies. An installed but unlicensed package is visible in management but cannot start a round.

## Future official distribution

The same contract can later sit behind an official distribution layer:

```text
Marketplace / CDN
      ↓
signed package
      ↓
license verification
      ↓
download
      ↓
install
      ↓
GamePackageScanner
      ↓
Registry
```

Future additions can include package signing, checksums, official download, staged update, rollback, merchant authorization and release channels without changing the game/runtime contract.

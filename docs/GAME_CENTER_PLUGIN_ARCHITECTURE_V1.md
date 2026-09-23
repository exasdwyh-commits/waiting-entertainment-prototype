# Game Center Plugin Architecture V1

## Goal

Waiting Entertainment evolves from a collection of games into a restaurant entertainment platform.

New games should be installable as packages instead of requiring Hub code changes.

Initial approach:

`copy game package -> scan -> validate -> register -> manage -> run`

Future approach:

`official download -> verify license -> install -> update -> rollback`

---

## Architecture

```
Waiting Entertainment Hub
│
├── Game Center
│   ├── Scanner
│   ├── Registry Manager
│   ├── Package Validator
│   ├── Runtime Manager
│   └── Update Manager (future)
│
└── Installed Games
    ├── pilot-racer
    ├── sea-battle
    └── table-push-king
```

---

## Package Contract

Every game package must contain:

```
game-package.json
server/
client/
assets/
tests/
```

The Hub only depends on the package contract, not internal gameplay implementation.

---

## Manifest Example

```json
{
  "id": "table-push-king",
  "name": "餐桌推推王",
  "version": "0.1.0",
  "category": "party-battle",
  "players": {
    "min": 2,
    "max": 10
  },
  "runtime": {
    "type": "process",
    "port": 9030
  },
  "control": {
    "mobile": true
  },
  "display": {
    "broadcast": true
  },
  "ai": {
    "fill": true
  }
}
```

---

## Discovery Flow

1. Hub starts.
2. Scanner searches installed game packages.
3. Validator checks manifest and runtime contract.
4. Registry stores available games.
5. Host Console displays available games automatically.
6. Runtime Manager controls lifecycle.

---

## Commercial Evolution

### V1 Local Plugin

Restaurant machine receives a package folder.

Example:

```
/game-center/import/new-game.zip
```

Hub imports and registers it.

### V2 Official Distribution

Add:

- Game Marketplace
- signed packages
- subscription entitlement
- automatic updates
- rollback
- merchant authorization

---

## Current Migration

Existing games:

- Pilot Racer
- Sea Battle
- Table Push King

will gradually move into the same Game Package registry.

The Hub remains the operating system layer.

Games become replaceable modules.

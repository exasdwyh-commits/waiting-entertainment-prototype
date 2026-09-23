# Game Center

Local Game Package installation root.

## Install a game

Create:

```text
game-center/installed/<game-id>/game-package.json
```

The manifest must implement the Game Package V1 contract documented in:

```text
docs/GAME_CENTER_PLUGIN_ARCHITECTURE_V1.md
```

The Hub scans this directory on startup. In Host Console → 游戏管理, **重新扫描游戏目录** reloads packages without editing Hub source code.

Current packages:

```text
installed/
├── pilot-racer/
├── sea-battle/
└── table-push-king/
```

A future official installer/downloader will write packages into this same installation layer after signature and license verification.

# Game Center

本目录是本地 Game Package 注册层。

安装清单：

```text
installed/
├── pilot-racer/
├── sea-battle/
└── table-push-king/
```

Hub 启动时扫描 `game-center/installed/<game-id>/game-package.json`。Host Console → 游戏管理 → **重新扫描游戏目录** 可在无活动场次时重新加载清单。

运行时代码位置：

- `table-push-king`：主仓 embedded runtime。
- `sea-battle`：`games/sea-battle`。
- `pilot-racer`：首次 `npm run setup` 自动准备到 `games/pilot-racer`；无需人工设置 `PILOT_RACER_DIR`。

新增游戏必须遵守 `docs/GAME_PACKAGE_V1.md` 和 `docs/GAME_CENTER_PLUGIN_ARCHITECTURE_V1.md`。未来安装器 / 下载器仍应写入同一注册层。

# New Game Template

Copy this directory to:

```text
game-center/installed/<game-id>/
```

Then:

1. rename the package id and entitlement;
2. choose a unique port;
3. place the game's runtime files in that directory;
4. keep `bundledPath` pointed at the installed directory;
5. implement `/info` so it reports the package health protocol;
6. implement the optional `/api/start` round-start action;
7. use Host Console → 游戏管理 → 重新扫描游戏目录.

No Hub source-code edit should be required for a conforming package.

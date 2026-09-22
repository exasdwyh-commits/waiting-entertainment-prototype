# Waiting Entertainment

Waiting Entertainment 是面向餐厅等位场景的本地多人娱乐系统：一台门店主机负责权威游戏状态与大屏输出，顾客扫码后用手机加入；Hub 负责等位、场次、游戏包、运行时和大屏播控。

> 当前阶段：**平台基础结构已成型，进入本地收尾与真机验收阶段。**
>
> 不建议继续扩架构或大量增加玩法。下一步请优先完成 `docs/LOCAL_FINISH_HANDOFF.md` 中的 P0/P1 收尾任务。

## Current baseline

截至 2026-09-22，主分支已合并：

- **Table Push King / 餐桌推推王**：内置 1-10 人物理乱斗，AI 补位、断线接管、个人手机视角、大屏自动导播与回放。
- **Pilot Racer / 极速等位赛**：作为外部 Game Package 接入 Hub，使用 `PILOT_RACER_DIR` 指向本地赛车仓库，默认端口 `:9010`。
- **Sea Battle V3 / 海战竞技**：仓库内置 process Game Package，默认端口 `:9020`，已完成物资成长、自动侧舷炮、三阶段节奏、复活、海怪、风暴缩圈、悬赏旗舰与连沉奖励。
- **Host Game Management Center**：已经合并，可查看全部 Game Package、授权、版本、端口、PID、运行目录、健康状态和日志，并对可管理的外部进程执行启动 / 预热 / 停止 / 健康检查。
- **Broadcast Shell**：统一承载游戏大屏、叫号 Overlay 与外部游戏运行中断提示。叫号不再由每个游戏重复实现。
- **Runtime safety**：支持仓库内置运行目录、环境变量覆盖、错误端口 / 错误协议预检；不会误杀占用目标端口的未知进程。

相关合并：
- PR #49 — Sea Battle V3 bounty + sink streak
- PR #52 — Sea Battle bounty impact lock
- PR #51 — Host game management center + runtime safety

## Important current status

当前功能主线不是“持续坏掉”。

最近主分支验证结果：

- **CI：通过**
- **Sea Battle Visual Preview：通过**
- **Hub Visual Preview：功能截图流程已完成并成功上传 artifact，但 workflow 最后自动提交截图回 `main` 时遇到并发提交，`git push` non-fast-forward，因此整条 Action 被标记为 failure。**

也就是说，当前最新 Visual Preview 红灯的根因是 **GitHub Actions 自己写回主分支的竞态**，不是游戏逻辑、Hub、管理界面或截图捕获失败。

本地模型收尾时请先修 `.github/workflows/visual-preview.yml` 的 screenshot auto-commit 策略，不要因为这条红灯重写游戏代码。

## Architecture

平台按 Game Package 管理多个游戏：

| Game | Runtime | Players | Port | Status |
| --- | --- | ---: | ---: | --- |
| 餐桌推推王 | embedded | 1-10 | 5173 / 5174 | 基础样板 |
| 极速等位赛 | external process | 1-8 | 9010 | 已接 Hub，独立仓库维护 |
| 海战竞技 | bundled process | 1-8 | 9020 | V3 已完成，待本地视觉 / 真机收尾 |

Hub 公共能力：

- Game Registry / entitlement
- Round lifecycle
- QR / guest join
- AI fill contract
- RuntimeManager
- Host Console
- Game Management Center
- Broadcast Shell
- Queue overlay
- Runtime health / logs / port preflight
- CI / browser visual regression

原则：**共享平台能力放 Hub；玩法、simulation、render 留在各 Game Package。**

## Services

运行：

```bash
npm install
npm run dev
```

要求 Node.js 22+、npm 10+。

| Service | Port |
| --- | ---: |
| Table Push King big screen | 5173 |
| Table Push King phone | 5174 |
| Host Console / 游戏管理 | 5175 |
| Broadcast Shell | 5176 |
| Guest join | 5177 |
| Hub authoritative server | 3001 |
| Pilot Racer | 9010 |
| Sea Battle | 9020 |

主机健康检查：

```text
http://127.0.0.1:3001/health
```

Host Console：

```text
http://127.0.0.1:5175
```

游戏管理页可以在 Host Console 顶部切换到 **游戏管理**。

如果要接本地 Pilot Racer：

```bash
export PILOT_RACER_DIR=/absolute/path/to/pilot-racer
npm run dev
```

Sea Battle 已支持仓库内置路径，正常情况下无需设置 `SEA_BATTLE_DIR`；该环境变量仍可用于覆盖运行目录。

## Validation

基础构建：

```bash
npm run build
```

关键平台 smoke：

```bash
node server/test/runtime-manager-smoke.mjs
node server/test/game-registry-smoke.mjs
node server/test/game-settings-store.mjs
node client/test/platform-ui-contract.mjs
```

Sea Battle 单独验证：

```bash
npm run build -w @waiting/sea-battle
```

最终交付前仍必须做真实门店环境验证：Windows 主机、大屏、门店 Wi-Fi、至少 8 台真实手机混合 iOS / Android。

## What is intentionally not finished

以下不是架构缺失，而是明确留给最后本地收尾：

1. 修复 Visual Preview workflow 自动回写截图导致的并发 push 竞态。（已完成：截图 workflow 改为 artifact-only，不再写回 main）
2. ~~游戏管理页的 settings 配置闭环~~（已完成：Game Settings Store 支持可编辑 → 校验 → 本地持久化 → 下次启动注入 env，运行中只提示 restart required）
3. Sea Battle 的船体 / 海域 / 海怪仍需更正式的 Blender / Hyper3D 资产与真机视觉调优；不要再靠大量程序几何硬堆。
4. Pilot Racer 继续在独立仓库完成 Bay GP V3 美术与 8 真机验收。
5. 所有游戏需要一次真实餐厅网络压力测试和长时间 soak。

完整收尾说明见：

**[docs/LOCAL_FINISH_HANDOFF.md](docs/LOCAL_FINISH_HANDOFF.md)**

## Product principle

这不是传统手机游戏，也不是云 SaaS 优先产品。当前优先级保持：

1. Game feel
2. Big-screen spectacle
3. Three-second learnability
4. LAN multiplayer stability
5. Personal phone-screen experience
6. AI fill
7. Fast creation of additional Game Packages
8. Venue / commercial management

当前产品边界仍是 **单门店 / 单主机 / 单活动游戏场次**。不要在本轮收尾扩展公网匹配、云权威服务器、多门店编排或复杂账号系统。

## Visual previews

真实运行构建的截图位于 `docs/screenshots/`，包括：

- `big-screen.png`
- `phone-player.png`
- `broadcast-replay.png`
- `hub-host.png`
- `hub-game-management.png`
- `hub-broadcast-recruiting.png`
- `hub-broadcast-queue.png`
- `sea-battle-live.png`
- `sea-battle-monster.png`

截图应作为验收 artifact，而不是让 GitHub Action 高频并发修改 `main`。具体整改见收尾文档。

## More docs

- `docs/GAME_PACKAGE_V1.md`
- `docs/HUB_ARCHITECTURE.md`
- `docs/ARCHITECTURE.md`
- `docs/BROADCAST_DIRECTOR.md`
- `docs/TUNING.md`
- `docs/ROADMAP.md`
- `docs/CORE_RECOMMENDATIONS.md`
- `docs/LOCAL_FINISH_HANDOFF.md`

# Local Finish Handoff

> Purpose: 给本地模型 / Codex 最后一轮收尾使用。  
> Scope: 不再扩架构，不再增加大玩法，优先把当前主分支稳定、可验收、可上店。

## 0. 当前事实基线

截至 2026-09-22，以下已经进入 `main`：

- Sea Battle V3（PR #49）
- Sea Battle 悬赏击沉边界修复（PR #52）
- Host Game Management Center + Runtime Safety（PR #51）
- Broadcast Shell 统一叫号 Overlay
- 外部 Game Package 运行时启动 / 停止 / 健康检查 / 日志
- bundled runtime path + env override
- 端口错误协议预检，避免误杀未知进程
- 大屏外部运行时中断提示
- 管理界面真实浏览器截图验收
- Replay visual preview 确定性测试钩子

功能合并基线：
- `cdd9761` — Merge Host game management center and runtime safety controls

随后有截图刷新提交；本地开始工作前务必：

```bash
git checkout main
git pull --ff-only
```

不要从旧 PR 分支继续开发。

---

## 1. 当前红灯到底是什么

最新 `Visual Preview` 的浏览器捕获过程已经完成：

- 服务启动成功
- Host / 管理界面截图成功
- Broadcast Shell 截图成功
- Queue Overlay 流程成功
- Replay 截图流程成功
- artifact 上传成功

workflow 最后失败在：

```text
git push origin HEAD:main
! [rejected] HEAD -> main (fetch first)
non-fast-forward
```

原因：Visual Preview Action 自己修改并提交 `docs/screenshots/*.png`，与此同时另一个 Action / 提交已经更新 `main`，导致截图 bot 的 push 被拒绝。

**这不是游戏功能失败。**

### P0-1 必做：停止 CI 自动并发写 main

文件：

```text
.github/workflows/visual-preview.yml
```

推荐方案，优先级从高到低：

### 推荐 A：artifact-only

默认 push / PR：

- 运行浏览器截图
- 上传 `visual-preview` artifact
- **不要自动 commit / push 截图**

只在人工需要刷新仓库内截图时：
- 手动 `workflow_dispatch`
- 或本地截图后人工 commit

这是最稳的方案。

完成标准：

- Visual Preview 不再因为 non-fast-forward 红灯
- PR / main 上截图仍可作为 artifact 查看
- workflow 不修改功能分支 / main

不要为了这个问题修改游戏、RuntimeManager、Broadcast Shell。

---

## 2. 收尾工作顺序

只按以下顺序做。

# P0 — 先得到稳定基线

## P0-1 修 Visual Preview auto-push race

见上一节。

## P0-2 本地完整验证 main

执行：

```bash
npm install
npm run build

node server/test/runtime-manager-smoke.mjs
node server/test/game-registry-smoke.mjs
node client/test/platform-ui-contract.mjs
```

然后：

```bash
npm run dev
```

检查：

- `:3001/health`
- `:5173` Table Push King display
- `:5174` phone
- `:5175` Host Console
- `:5176` Broadcast Shell
- `:5177` Guest join

Host Console 必须能：

- 切换“现场控制 / 游戏管理”
- 显示 3 个 Game Package
- 显示版本 / tier / 玩家数 / runtime / port / PID / config source
- Sea Battle 能启动 / 预热
- 健康检查能更新
- 日志能查看
- 有活动场次时不能误停止该 runtime

## P0-3 Sea Battle Hub 全链路

不要只单独跑 `npm run dev:sea`。

必须从 Hub：

1. Host 创建 Sea Battle round
2. Guest 扫码 / join
3. Host lock
4. Host start
5. Hub 自动启动 Sea Battle process
6. 手机自动进入 `:9020`
7. Broadcast Shell 显示 `:9020/display`
8. finish / cancel 后 runtime 正确释放
9. 手机返回 Hub

完成后再认为 Game Package 生命周期闭环完成。

---

# P1 — 管理界面真正收尾

当前游戏管理中心已经能“看”和“控制 runtime”，但 **settings 仍未完成完整配置闭环**。

## 当前已有

Manifest 已支持：

- text
- number
- enum
- boolean
- default
- min / max / step
- options
- env
- wired

当前定义示例：

Pilot Racer：

- `TRACK`
- `LAPS`
- `RACE_SECONDS`

Sea Battle：

- `RACE_SECONDS`

Host 已经能显示这些默认参数。

## 当前缺失

RuntimeManager 启动 process 时目前只注入：

- `PORT`
- `HOST`
- `ROOM_CODE`
- `WAITING_HUB_RUNTIME`

还没有：

- 管理页编辑 setting
- 本地持久化
- setting 校验
- 将 setting 映射到 env
- “已修改 / 下次启动生效”状态
- 恢复默认值

## P1-1 建议实现：Local Game Settings Store

不要上数据库。

建议新建：

```text
server/src/platform/GameSettingsStore.ts
```

数据存本机：

```text
.waiting/game-settings.json
```

并加入 `.gitignore`。

推荐结构：

```json
{
  "pilot-racer": {
    "trackId": "bay",
    "laps": 3,
    "seconds": 150
  },
  "sea-battle": {
    "seconds": 180
  }
}
```

要求：

- 文件不存在时使用 manifest default
- 非法值拒绝，不静默修正
- number 做 min / max / step 校验
- enum 必须属于 options
- unknown key 不允许写入
- 原子写文件：temp + rename

## P1-2 API

建议：

```text
GET /api/platform/games/:gameId/settings
PUT /api/platform/games/:gameId/settings
POST /api/platform/games/:gameId/settings/reset
```

PUT body 只传 setting values。

如果 runtime 正在运行：

- 可以保存
- 明确返回 `restartRequired: true`
- 不动态修改正在运行的 process

## P1-3 RuntimeManager 注入 settings

在 `spawn()` 前获取 resolved settings。

对于 `wired: true` 且存在 `env` 的 setting：

```text
setting.env = String(resolvedValue)
```

合并顺序建议：

1. `process.env`
2. Hub 固定 runtime env（PORT / HOST / ROOM_CODE）
3. Game Settings Store 映射 env

注意：
- 不要允许 setting 覆盖 PORT / HOST / ROOM_CODE
- 不要修改 embedded game runtime

## P1-4 Host UI

游戏管理卡片中将默认参数从只读改为：

- number input
- enum select
- boolean switch
- text input

按钮：

- 保存
- 恢复默认
- 如果 runtime 正在运行，显示“下次启动生效”

不要做复杂弹窗。

完成标准：

- Pilot Racer 可改赛道 / 圈数 / 时长
- Sea Battle 可改单局时长
- 重启 runtime 后实际 `/info` / 游戏状态反映新值
- 页面刷新后配置仍存在

---

# P1 — Sea Battle 最后游戏收尾

## 当前 V3 已有

不要重复实现：

- 1-8 人
- AI fill
- 左方向 / 右加速
- 自动侧舷炮
- 物资
- XP / 升级三选一
- 死亡复活
- 三阶段 180s 节奏
- storm / shrinking safe sea
- 海怪
- 积分
- 悬赏旗舰
- 连沉奖励
- 悬赏击沉计分边界修复
- 手机 HUD
- venue leaderboard
- visual preview

## P1-5 不要再新增大系统

下一轮重点只有：

### 视觉

目前最大短板是程序化船体 / 场景感。

优先：

- 3-5 套船体模型
- 船帆 / 炮口 / 船尾辨识
- 岛屿 / 礁石 / 灯塔 / 漂浮物
- 海怪正式模型
- 更强命中 FX
- 升级后的可视化变化

推荐 Blender / Hyper3D。

Three.js 侧只做：
- GLB loader
- asset slot
- fallback geometry
- LOD / shadow / material normalization

不要重新写 simulation。

### 玩法微调

只允许基于真机反馈调整：

- 船转向响应
- boost 能量
- broadside 触发窗口
- cannon interval
- monster 频率
- storm 压力
- bounty threshold / bonus
- comeback 强度

不要凭感觉继续堆技能按钮。

---

# P1 — Pilot Racer 接入验收

Pilot Racer 保持独立仓库维护：

```text
https://github.com/exasdwyh-commits/pilot-racer
```

Hub 只通过 Game Package 接入。

本地：

```bash
export PILOT_RACER_DIR=/absolute/path/to/pilot-racer
npm run dev
```

验证：

- Host 游戏管理显示 configured
- 健康检查通过
- runtime start / stop
- Hub round lifecycle
- display / phone 跳转
- result / finish 返回 Hub

不要把 Racer 源码复制进本仓库。

Racer 自身剩余工作以它自己的 handoff / issue 为准，主要是：

- Bay GP V3 Blender / Hyper3D 环境
- 8 真机门店验收

---

# P1 — 真实门店验收

这是上线前最重要的一步。

环境：

- Windows 门店主机
- 真实大屏
- 门店 Wi-Fi
- 至少 8 台手机
- 尽量混合 iOS / Android

每个游戏至少：

- 连续 3 局
- 10-20 分钟 soak
- 中途断 Wi-Fi
- 手机锁屏 / 恢复
- 浏览器刷新
- Host 切换页面
- 叫号 Overlay 插入
- runtime 故意终止一次

记录：

- FPS
- RTT
- input-to-screen
- reconnect
- 发热
- 掉帧
- stuck touch
- host process crash
- memory growth

如果问题不能稳定复现，不进行架构性重写。

---

## 3. 当前已知非阻塞问题

### 3.1 GLTF colormap texture warning

Visual Preview 日志中能看到：

```text
THREE.GLTFLoader: Couldn't load texture Textures/colormap.png
```

这不是当前 CI 主失败原因，但应在本地资产整理时解决。

检查 GLB / GLTF 是否仍引用外部 `Textures/colormap.png`。

推荐最终交付资产：

- GLB self-contained
- texture embedded 或明确位于静态资源路径
- 不依赖建模工具导出目录结构

### 3.2 Node Action warning

GitHub 日志有 actions Node 20 deprecation warning。

当前项目运行 Node 22；这是 GitHub Action 版本运行时警告，不是业务 bug。

有稳定新版 action 时再升级，不要为此调整游戏。

### 3.3 package version mismatch

`games/sea-battle/game-package.json` 已是 `0.2.0`，workspace `games/sea-battle/package.json` 仍为 `0.1.0`。

建议收尾时统一为 `0.2.0`，避免运营界面 / npm workspace / package manifest 概念混乱。

---

## 4. 不要做的事情

本轮明确不要：

- 重写 Hub
- 重写 RuntimeManager
- 上 Kubernetes / Docker orchestration
- 做公网 matchmaking
- 做云权威游戏服务器
- 多门店中心化调度
- 重写 Three.js 为 Unity
- 给海战继续加大量主动技能
- 把 Racer 复制进 Hub 仓库
- 因 Visual Preview 红灯重写游戏逻辑
- 用更多 Box / Cylinder 冒充正式美术

---

## 5. 推荐 Git 工作方式

每个收尾问题单独 branch：

```text
fix/visual-preview-artifact-only
feat/game-settings-store
fix/sea-assets
test/venue-acceptance
```

每个 PR：

- 小范围
- 明确验收标准
- 不混玩法 / 平台 / CI
- CI 绿再合并

Visual Preview 修复后，不允许 workflow 再因为自己 push main 形成无限触发 / race。

---

## 6. 最终完成标准

满足以下条件后，当前平台可以宣布“基础版开发完成”：

- [ ] `npm run build` 通过
- [ ] CI 全绿
- [ ] Visual Preview 不再因 auto-push race 红灯
- [ ] Sea Battle Visual Preview 绿
- [ ] Host 游戏管理真实浏览器页面正常
- [ ] Sea Battle 可由 Hub 一键启动 / 开局 / 结束
- [ ] Pilot Racer 可由 Hub 接管生命周期
- [ ] 游戏 settings 可编辑、持久化、下次启动生效
- [ ] Broadcast Shell 叫号在所有 Game Package 上一致
- [ ] runtime 被杀时 Host / Broadcast 都能明确降级提示
- [ ] 端口被未知服务占用时不会误杀
- [ ] 8 真机 LAN 验收通过
- [ ] Windows 主机 10-20 分钟 soak 无需人工重启
- [ ] 海战至少完成第一轮正式 GLB 美术替换

完成这些以后，再开始第三个游戏或商业部署功能。

---

## 7. 给本地模型的直接任务指令

可以直接把下面这段作为本地模型任务：

> 你现在负责 Waiting Entertainment 的最后收尾。先阅读 README.md、docs/LOCAL_FINISH_HANDOFF.md、docs/GAME_PACKAGE_V1.md、docs/HUB_ARCHITECTURE.md。以当前 main 为唯一事实源，不回退已合并的 PR #49/#51/#52。
>
> 第一优先修复 .github/workflows/visual-preview.yml：Visual Preview 当前浏览器捕获和 artifact 上传已经成功，红灯来自 workflow 自动提交截图到 main 时出现 non-fast-forward。改成稳定的 artifact-only 策略，不要为此修改游戏逻辑。
>
> 然后完整跑 build、RuntimeManager smoke、GameRegistry smoke、platform UI contract。
>
> 第二优先完成 Game Settings Store：让 Host 游戏管理页中的 manifest settings 可编辑、校验、持久化，并在 process runtime 下次启动时注入对应 env；正在运行中的游戏只提示 restart required，不热改进程。
>
> 第三优先做 Hub 下 Sea Battle / Pilot Racer 的完整生命周期本地验收。Sea Battle 不增加新大玩法，主要修真实 bug、美术插槽和真机体验。
>
> 不重写架构，不做云化，不做 matchmaking，不复制 pilot-racer 源码进 Hub，不因 CI 截图问题修改权威 simulation。
>
> 每完成一个独立问题开一个小 PR，给出验证命令和结果。最终以 docs/LOCAL_FINISH_HANDOFF.md 的“最终完成标准”为验收清单。

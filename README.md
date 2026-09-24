# Waiting Entertainment · 等位娱乐系统

这是可以直接交给本地 Agent 部署的主仓库。目标是 **一台门店电脑 + 一个大屏 + 顾客手机扫码**，不依赖云端权威服务器。

当前交付包含：

- **餐桌推推王**：1–10 人物理派对乱斗，内置运行时。
- **海战竞技**：1–8 人成长海战，内置运行时。
- **极速等位赛**：1–8 人卡丁车竞速；首次 setup 会自动拉取固定版本的精简运行时。
- **Host Console / 游戏管理中心**：开局、锁定、结束、游戏参数、运行时状态、日志。
- **Broadcast Shell**：统一大屏、报名二维码、叫号 Overlay。
- **Guest Join**：统一扫码报名与手机控制跳转。
- **Game Center**：插件发现、运行时管理、授权与参数配置。

## 最短部署路径

要求：

- Node.js 22+
- npm 10+
- Git
- 电脑、大屏和手机位于同一局域网 / Wi-Fi

执行：

```bash
git clone https://github.com/exasdwyh-commits/waiting-entertainment-prototype.git
cd waiting-entertainment-prototype
npm run setup
npm start
```

`npm run setup` 会完成依赖安装、准备 Pilot Racer 精简运行时并构建全部工作区。可重复执行。

`npm start` 是本地演示入口，默认以 **PRO demo** 启动，因此三个游戏都会出现在游戏中心。若显式设置了 `WAITING_PLAN`，则尊重该值。

## 启动后的入口

| 功能 | 地址 |
| --- | --- |
| Host Console / 游戏管理 | `http://127.0.0.1:5175` |
| Broadcast Shell / 大屏 | `http://127.0.0.1:5176` |
| Hub 健康检查 | `http://127.0.0.1:3001/health` |
| 餐桌推推王大屏 | `http://127.0.0.1:5173` |
| 餐桌推推王手机端 | `http://127.0.0.1:5174` |
| 极速等位赛运行时 | `:9010`，由 Hub 按需启动 |
| 海战竞技运行时 | `:9020`，由 Hub 按需启动 |

手机扫码必须使用主机的 **局域网 IP**，不要使用手机自己的 `localhost`。

## 推荐现场流程

1. 主机打开 `:5175` Host Console。
2. 大屏全屏打开 `:5176` Broadcast Shell。
3. 在 Host Console 选择游戏并开放报名。
4. 顾客扫码，输入昵称，进入对应控制界面 / 等待状态。
5. 主持人锁定报名并开局。
6. Hub 自动启动需要的游戏进程并切换大屏。
7. 结束本轮后可直接创建下一轮。

## Pilot Racer 的处理

仓库不再要求人工设置 `PILOT_RACER_DIR`。

首次 `npm run setup` 会从：

`exasdwyh-commits/pilot-racer@112bfe18dff7065fc98f12ae85c9679f1527b216`

以 sparse checkout 方式准备到：

`games/pilot-racer/`

该目录被主仓 `.gitignore` 忽略，因此不会把另一个仓库的开发历史、生成素材和实验文件污染主仓。Hub 默认通过 `runtime.bundledPath` 使用它；`PILOT_RACER_DIR` 只保留为高级覆盖选项。

## 验证

代码级验证：

```bash
npm run verify
```

现场最低验收：

- `:3001/health` 返回 `ok: true`
- Host Console 能看到 3 个游戏
- 大屏能显示当前报名二维码
- 同 Wi-Fi 手机扫码能进入
- 至少完成一局餐桌推推王、一局赛车、一局海战

Windows 第一次运行时，如果系统弹出防火墙提示，请允许 Node.js 在当前专用网络通信。

## 给本地 Agent

仓库根目录的 [AGENTS.md](AGENTS.md) 是部署执行单。部署 Agent 应优先执行，不要先重构项目。

开发和运行细节见：

- [docs/RUNNING.md](docs/RUNNING.md)
- [docs/GAME_CENTER_PLUGIN_ARCHITECTURE_V1.md](docs/GAME_CENTER_PLUGIN_ARCHITECTURE_V1.md)
- [docs/GAME_PACKAGE_V1.md](docs/GAME_PACKAGE_V1.md)
- [docs/TUNING.md](docs/TUNING.md)
- [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md)

# Running Waiting Entertainment

## Requirements

- Node.js 22+
- npm 10+
- Git
- 主机、大屏、手机位于同一 LAN / Wi-Fi

## First install

```bash
npm run setup
```

该命令会：

1. 准备主仓依赖。
2. 以 sparse checkout 拉取固定版本 Pilot Racer 到 `games/pilot-racer`。
3. 安装 Pilot Racer 生产依赖。
4. 构建主仓全部工作区。

无需手动设置 `PILOT_RACER_DIR`。该变量只保留为高级覆盖选项。

## Start venue demo

```bash
npm start
```

本地演示默认 `WAITING_PLAN=PRO`，因此三个游戏都可用。显式环境变量仍可覆盖该值。

| Surface | Address |
| --- | --- |
| Table Push King display | `http://<HOST-LAN-IP>:5173` |
| Table Push King phone | `http://<HOST-LAN-IP>:5174` |
| Host Console | `http://<HOST-LAN-IP>:5175` |
| Broadcast Shell | `http://<HOST-LAN-IP>:5176` |
| Guest Join | `http://<HOST-LAN-IP>:5177/join/<ROUND_CODE>` |
| Hub server | `http://<HOST-LAN-IP>:3001` |
| Pilot Racer | `:9010`，Hub 按需启动 |
| Sea Battle | `:9020`，Hub 按需启动 |

手机必须使用主机 LAN IP，不能使用 `localhost`。

## Normal hosted flow

1. Host Console 选择游戏并开放报名。
2. Broadcast Shell 显示本轮动态 QR。
3. 顾客扫码并输入昵称。
4. Embedded 游戏立即进入控制页等待开局；process 游戏在锁定报名时由 Hub 预热运行时。
5. 主持人锁定并开局。
6. Broadcast Shell 切换到对应游戏大屏。
7. 结束场次后，Hub 只停止自己启动的子进程。

## Runtime diagnostics

Host Console → 游戏管理提供：

- 启动 / 预热
- 停止
- 健康检查
- PID / 端口 / 运行目录
- stdout / stderr 日志
- 游戏参数保存；进程运行中修改的参数在下次启动生效

## Validation

```bash
npm run verify
```

最低现场验收还应覆盖：

- Windows / macOS 主机实际局域网
- iOS + Android 混合扫码
- 至少 8 台真机并发
- 大屏长时间运行
- 门店 Wi-Fi 不启用 client isolation

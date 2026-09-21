# 《猛兽派对》战斗体验对标矩阵 / Party Animals Combat Parity Matrix

> 本文档是 Waiting Entertainment / 餐桌推推王的“战斗体验基线”。
>
> 当前策略：**先把同类头部产品一场战斗中真正有用的机制层、反馈层、物理层做齐，再在餐厅等位场景里做进一步升级。**
>
> 这里对标的是玩法机制、节奏、反馈、物理交互和战斗结构，不复制具体角色造型、地图美术、UI、音效、动画素材、品牌元素或源代码。

---

# 1. 对标原则

目标不是“有几个相似功能”。

目标是：

> 玩家进入一场乱斗后，能感受到的核心战斗动词、身体物理、KO、体力、抓投、武器、环境、风险回报、多人混战、镜头、回放和胜负戏剧性，必须形成完整闭环。

当前优先级：

1. 先做到战斗体验机制完整；
2. 再做到手感接近成熟物理派对游戏；
3. 最后再做 Waiting Entertainment 自己的强化版本。

---

# 2. 外部基准确认

公开资料可以确认《Party Animals / 猛兽派对》的战斗基线至少包含：

- 真实 / 强物理交互；
- Last Stand 生存淘汰；
- Team Score / 团队任务玩法；
- 角色 HP / Stamina；
- 武器开关；
- 拳击、踢击、头槌等攻击维度；
- 抓取、搬运、投掷；
- 跑动动量影响攻击；
- Knockout / 击晕与恢复；
- 武器和环境共同改变局势；
- 后续 SMASH 模式还扩展了拳、踢、头槌、速度、跳跃、翻滚、震荡冲击等战斗能力。

因此我们的“战斗 parity”不能只停留在：

**移动 + 冲撞 + 掉下桌。**

---

# 3. 当前总体差距判断

当前餐桌推推王已经具备：

- 物理移动；
- 动量冲撞；
- Balance / 失衡；
- Knockdown / 倒地；
- Recovery / 恢复；
- Ledge Hang / 抓边；
- Climb / 爬回；
- 情境抓起 / 甩飞 V1；
- 旋转环境机关；
- AI；
- 大屏导播；
- Replay；
- 手机个人画面；
- 主机权威物理。

但与完整物理派对战斗相比，仍缺失几个核心维度：

### 当前最大缺口

1. **攻击动词太少**；
2. **抓取还不是真正持续 Grapple**；
3. **没有 Stamina / 体力资源管理**；
4. **KO 体系还不够完整**；
5. **没有跳跃 / 飞踢 / 头槌这类身体攻击**；
6. **没有武器 / 可拾取物件**；
7. **场景可交互物件不足**；
8. **角色身体的 Active Ragdoll 视觉不足**；
9. **攻击层的烟雾、扭曲、压缩、拖尾、重击包装仍不足**；
10. **60 秒局长太短，不足以形成完整 3 分钟乱斗故事。**

---

# 4. 战斗动词对标

## 4.1 Movement / 移动

### 基准体验

需要包括：

- 普通移动；
- 加速 / Sprint；
- 急停；
- 转向惯性；
- 被撞后的失控移动；
- 跑动动量参与攻击。

### 当前状态

**部分完成。**

已有：

- 摇杆移动；
- 最大速度；
- 动量冲撞；
- camera-relative 输入；
- friction / damping 调参。

### 下一步

增加明确：

- 普通移动；
- Sprint 状态；
- Sprint 消耗体力；
- 急停身体后仰；
- Sprint 身体前倾；
- 高速转弯更明显的侧倾。

---

## 4.2 Punch / 拳击

### 基准体验

物理派对游戏需要一个：

- 快速；
- 短距离；
- 风险低；
- 可连续使用；

的基本攻击。

### 当前状态

**缺失。**

目前“冲撞”承担了太多功能。

### 目标

手机增加快速攻击：

**拳击 / 扇击 / 拍击**

用途：

- 打断抓取；
- 近身骚扰；
- 造成少量 Balance 损失；
- 高速状态下可升级为 Heavy Punch。

不直接照搬动作表现，但保留同类战斗角色。

---

## 4.3 Heavy Punch / 冲刺重拳

### 基准体验

社区长期存在的核心技巧之一就是：

**跑起来以后攻击，动量让攻击更强。**

### 当前状态

**已经有部分基础。**

我们的 momentum push 已经具备：

- 低速攻击弱；
- 高速攻击强。

### 目标

把当前“冲撞”进一步区分：

- 低速：肩撞 / 普通撞；
- Sprint + 攻击：重冲撞 / Heavy Strike；
- 命中时增加更明显 Knockout 权重。

---

## 4.4 Kick / 踢击

### 当前状态

**缺失。**

### 为什么需要

踢击不是为了多一个伤害键。

它应该承担不同战术：

- 对倒地敌人产生位移；
- 桌边把敌人踢下去；
- 对正在抓边的人进行干扰；
- 和 Punch 的攻击高度不同。

### 手机方案

不一定永久增加第三个大按钮。

可以：

- 右侧小型 Kick；
- 或在倒地目标附近自动变为“踢”。

需要真机测试决定。

---

## 4.5 Headbutt / 头槌

### 当前状态

**缺失。**

### 价值

头槌应该是：

- 近身爆发；
- 双手抓人时仍能攻击；
- 高风险；
- 可能反伤 / 自己失衡。

这非常适合物理喜剧。

### 设计建议

当双手处于抓取状态：

主攻击自动从 Punch / Push 变为：

**Headbutt / 头槌**

这样不需要增加太多 UI。

---

## 4.6 Jump / 跳跃

### 当前状态

**缺失。**

### 必要性

如果想真正接近完整物理派对体验，Jump 基本不能永久缺席。

用途：

- 越过角色；
- 躲攻击；
- 地图机关；
- Dropkick；
- 高低差；
- 桌面物件互动。

### 手机 UI

建议不是大按钮。

使用右侧一个较小的 Jump 键。

---

## 4.7 Dropkick / 飞踢

### 当前状态

**缺失。**

### 价值

这是物理派对游戏最经典的高风险高回报动作之一：

Sprint
→ Jump
→ Kick
→ 身体整个飞出去

特点：

- 强；
- 爽；
- 容易自己翻车；
- 围观效果很好。

非常适合 Waiting Entertainment。

---

# 5. Grapple / 抓取系统

## 5.1 当前 V1

已经实现：

- 对失衡 / 倒地玩家；
- 自动抓起；
- 短暂 Lift；
- 自动甩飞；
- 被第三人撞击可中断。

这只是：

**Grab/Toss Prototype。**

不是最终 Grapple。

---

## 5.2 完整 Grapple 目标

需要逐步做到：

### 抓住

- 正常状态也能抓；
- 单手 / 双手概念；
- 抓身体不同部位；
- 抓取有距离和角度。

### 拖拽

抓住后：

- 可以移动；
- 对方身体被拖动；
- 两人重心相互影响。

### 抬起

按住 Lift / Action：

- 消耗 Stamina；
- 将 KO / 低 Balance 目标逐渐抬起来。

### 挣脱

被抓者恢复意识后：

- 可快速攻击；
- 消耗抓取者 Stamina；
- 有机会挣脱。

### 投掷

Throw 力量应该受到：

- Stamina；
- 旋转速度；
- 移动速度；
- 目标重量；
- 抬起高度；

共同影响。

目标：

> 甩飞不是播放动画，而是玩家真的“制造出了这次投掷”。

---

# 6. Stamina / 体力

## 当前状态

**缺失。**

这是当前与成熟物理派对战斗最大的系统差距之一。

## 体力应该控制

- Sprint；
- 抓取；
- 抬人；
- 长时间 Carry；
- Heavy Attack；
- Dropkick；
- 爬边；
- 连续挣扎。

## 为什么重要

没有 Stamina：

- 抓人容易无脑；
- Sprint 没成本；
- 强攻击可以无限使用；
- 战斗缺乏节奏。

有 Stamina 后会形成：

攻击
→ 消耗
→ 暂时回避
→ 恢复
→ 再进场

这种自然节奏。

## 手机 UI

不要做 RPG 蓝条。

建议：

- 角色脚下 / 按钮外围薄环；
- 高于 50% 时不突出；
- 低体力时才明显；
- 颜色 + 震动 + 呼吸节奏提示。

---

# 7. HP / KO / Wake-up

## 当前状态

我们有：

- Balance；
- Hit；
- Ragdoll；
- Recovering。

但还不是完整 KO 体系。

## 完整目标

角色应该有两个不同概念：

### HP / Knockout Resistance

决定：

**这次攻击会不会把人直接打晕。**

### Stamina

决定：

**你还能不能继续跑、抓、抬、重击。**

不能把两者混成一个值。

## KO 状态

需要形成：

- 正常；
- Stagger；
- Knocked Down；
- KO / Unconscious；
- Wake-up；
- Temporary Invulnerability / 防止连锁永久控制。

攻击越强：

- KO 时间越长。

武器 / 高速重击：

- 更容易造成长 KO。

---

# 8. Recovery / 挣扎与恢复

需要加入：

- KO 视觉；
- 醒来动画；
- 被抓时恢复意识；
- 醒来后挣脱；
- 极短保护窗口。

玩家应该始终有：

> “我还有可能回来。”

而不是倒地后只能看。

---

# 9. Weapons / 武器与拾取物

《Party Animals》官方明确把武器作为核心展示元素，Custom Game 也允许单独关闭 Weapons。

因此如果目标是“战斗 parity”，武器最终不能缺失。

## 武器系统需要的底层能力

- 物件 Spawn；
- Pickup；
- 单手 / 双手持有；
- Weapon Collider；
- Swing；
- Throw；
- Drop；
- 被击落；
- 武器自身物理。

## 第一批武器不需要复制具体原作

我们可以做餐厅主题：

### 近战

- 巨型锅铲；
- 擀面杖；
- 大汤勺；
- 烧烤夹；
- 大葱；
- 平底锅。

### 投掷

- 盘子；
- 杯子；
- 调料瓶；
- 柠檬；
- 小餐篮。

### 特殊

- 灭火器；
- 冰桶；
- 辣椒喷雾式“搞笑”机关；
- 气泡水瓶。

玩法功能对标，但视觉完全是我们自己的餐厅世界。

---

# 10. Environment / 环境物理

## 当前

已有：

- 大型桌面；
- 旋转 Lazy Susan；
- 边缘掉落。

## Parity 目标

环境必须包括：

- 移动平台；
- 旋转物；
- 推力区；
- 滑区；
- 掉落物；
- 随机危险；
- 可抓住边缘；
- 可拾取环境物；
- 可被物件撞击。

## 第一张完整地图建议

“旋转餐桌”继续升级：

- 中央转盘；
- 动态盘子；
- 饮料瓶滚动；
- 服务员托盘扫场；
- 蒸汽喷发；
- 最后阶段转速加快；
- 部分盘子可以抓起扔人。

---

# 11. Active Ragdoll / 身体物理

## 当前

玩法层主要还是：

**单主刚体 + 动画。**

## 需要升级

视觉层至少加入：

- Sprint 前倾；
- 急停后仰；
- 转向侧倾；
- Punch 上半身扭转；
- 被撞胸腔后仰；
- Headbutt 全身前扑；
- Dropkick 双腿伸出；
- 被抓四肢摆动；
- Carry 身体下垂；
- Throw 空中旋转；
- KO 瘫软；
- Ledge 双臂挂边。

### 长期目标

不是完全自由 ragdoll。

而是：

**Active Ragdoll + Gameplay Controller。**

玩家有控制感，但身体一直“不太听话”。

---

# 12. Combat VFX / 战斗包装

当前用户目标明确：

**战斗必须有更强的烟雾、形变、物理、格斗动效包装。**

## 每种攻击至少包含六层反馈

### 1. Anticipation / 预备动作

- 身体压缩；
- 后仰；
- 肩膀蓄力。

### 2. Motion / 运动轨迹

- 烟尘；
- 速度拖尾；
- 风压；
- 极短 motion smear。

### 3. Impact / 命中

- Hit-stop；
- Camera Shake；
- FOV Kick；
- Contact Flash；
- Shock Ring；
- Dust / Smoke。

### 4. Deformation / 形变

角色视觉骨骼：

- 横向压缩；
- 瞬间拉伸；
- 头 / 身体被撞偏；
- 命中侧局部夸张。

### 5. Physics / 物理结果

- 线性冲量；
- 角冲量；
- Balance 损失；
- Ragdoll；
- 翻滚。

### 6. Recovery / 余韵

- 滑行烟尘；
- 地面摩擦；
- 呼吸；
- 晕眩星星 / 摇晃；
- 起身。

---

# 13. Combat Audio / 声音

至少要有：

- 空挥；
- 轻拳；
- 重击；
- 身体落地；
- 武器碰撞；
- KO；
- 抓取；
- 抛出；
- 边缘危险；
- 极限救回；
- 最终淘汰；
- 环境机关。

声音不能全部靠一个通用“砰”。

---

# 14. Camera / 战斗镜头

当前已经进入 V1：

- Master；
- Impact；
- Edge；
- Duel；
- Winner；
- Replay Master；
- Replay Reverse。

Parity 继续要求：

- Heavy Hit 更短暂、更暴力的镜头反馈；
- Dropkick 自动跟镜；
- Throw 空中跟拍；
- Weapon KO 特写；
- Final 1v1 导播；
- Replay 多角度。

---

# 15. 三分钟乱斗结构

用户已经确定：

**约 3 分钟一局。**

这比 60 秒更适合完整物理乱斗。

但不能把原来 60 秒简单乘 3。

## 推荐 180 秒结构

### 0–60 秒：开放混战

- 武器较少；
- 地图机关温和；
- 玩家熟悉操作；
- KO 后快速恢复；
- 尽量不让人太早永久出局。

### 60–135 秒：高密度乱斗

- 武器增加；
- 转盘加快；
- 环境物件增加；
- 抓投频率提高；
- KO 时间适中。

### 135–165 秒：危险升级

- 场景危险提高；
- 更强视觉包装；
- 生存压力开始明显。

### 165–180 秒：Final Chaos

- 最终淘汰；
- 环境进一步加速；
- 导播进入决胜模式；
- 回放权重提升。

这比“全程 Last Survivor”更适合餐厅顾客。

---

# 16. 手机操作目标

如果我们要做到完整战斗 parity，就不能永远只有一个按钮。

但也不能照搬手柄六七个键。

## 建议横屏布局

### 左手

**大摇杆**

负责：

- Move；
- Sprint（外圈 / 长推）；
- Throw Direction。

### 右手核心

#### 大按钮：Attack

上下文：

- Punch；
- Sprint 时 Heavy Strike；
- 持武器时 Weapon Attack；
- 抓住人时 Throw。

#### 中按钮：Grab

上下文：

- Grab；
- Hold；
- Pickup Weapon；
- Carry；
- Ledge Grab / Climb Assist。

#### 小按钮：Jump

上下文：

- Jump；
- Sprint + Jump + Attack = Dropkick。

#### 可选小按钮：Kick

第一轮可独立存在。

后续测试如果 UI 太复杂，再改成 Context Kick。

## UI 原则

- 不显示长文字；
- 状态通过 Icon / 颜色 / 按钮尺寸变化表达；
- Grab 成功后 Attack 自动视觉切换为 Throw；
- 拿武器后 Attack 图标变 Weapon；
- Stamina 通过外围环显示；
- 中心游戏画面保持干净。

---

# 17. Weapons 与手机操作

Grab 键同时承担：

- 抓人；
- 捡武器；
- 放下武器。

Attack 键：

- 空手 = Punch / Heavy Punch；
- 有武器 = Weapon Attack；
- 抓住敌人 = Throw。

这样手机不会出现：

**Punch / Grab / Throw / Pickup / Weapon / Drop**

六个按钮。

---

# 18. Multiplayer Chaos / 多人混战元素

一场完整的物理乱斗必须出现：

- 第三人偷袭；
- 抓人时被别人打断；
- 两个人一起掉下去；
- 武器误伤；
- AI 自己翻车；
- 追击；
- 复仇；
- 抢武器；
- 桌边争夺；
- 1v1 决胜。

AI 后续必须学会这些行为，而不只是“找最近目标然后撞”。

---

# 19. Team / Friendly Fire

官方 Custom Game 可配置 Friendly Fire；即使关闭直接伤害，击退仍可能存在。

我们第一款餐桌推推王仍以 FFA 为主。

但 Waiting Engine 后续需要预留：

- Team；
- Friendly Fire；
- Team Knockback；
- Shared Score。

为海战 / 足球 / 搬运类游戏复用。

---

# 20. Perks / SMASH 类成长

官方后续模式加入了：

- Punch；
- Kick；
- Headbutt；
- Speed；
- Jump；
- Roll；
- Slam Shockwave；

相关强化和 Perk。

我们暂时**不优先做成长系统**。

原因：

先把基础战斗动词做完整。

后续如果做多轮模式，可把它转化成：

**每局中途三选一临时强化。**

这和我们之前海战的“三选一升级”经验可以复用。

---

# 21. Parity Matrix

状态：

- ✅ = 已完成基础能力
- 🟡 = 已有 V1，但与完整战斗仍有明显差距
- 🔴 = 缺失
- ⚪ = 后续模式层能力

| 战斗元素 | 当前 | Parity 目标 |
| --- | --- | --- |
| 基础移动 | ✅ | 继续调手感 |
| Sprint | 🔴 | 增加 + Stamina |
| 动量攻击 | ✅ | Heavy Strike 更明确 |
| Punch | 🔴 | 快速基础攻击 |
| Kick | 🔴 | 倒地 / 桌边用途 |
| Headbutt | 🔴 | 抓人时近身攻击 |
| Jump | 🔴 | 跳跃和地图互动 |
| Dropkick | 🔴 | 高风险飞踢 |
| Grab | 🟡 | 从自动抓取升级到持续 Grapple |
| Carry | 🟡 | 允许移动 / 体力消耗 |
| Throw | 🟡 | 方向 / 动量 / Stamina / 旋转共同决定 |
| Struggle / Break Grab | 🔴 | 被抓者可挣脱 |
| Stamina | 🔴 | Sprint / Grab / Heavy / Climb 共同资源 |
| HP / KO Resistance | 🔴 | 与 Stamina 分离 |
| KO | 🟡 | 完整意识丧失 / 醒来体系 |
| Knockdown | ✅ | 继续做 Active Ragdoll |
| Recovery | ✅ | 加 Wake-up / Protection |
| Ledge Grab | ✅ | 加真实手臂表现 |
| Climb | ✅ | 加物理肢体 |
| Weapons | 🔴 | 餐厅主题武器 |
| Weapon Pickup | 🔴 | Grab 键复用 |
| Weapon Throw | 🔴 | 物理投掷 |
| Environment Props | 🔴 | 盘子 / 瓶子 / 餐具 |
| Active Hazard | ✅ | 已有旋转转盘 |
| Multiple Hazards | 🟡 | 增加 1–2 个高识别机关 |
| Ragdoll Visual | 🟡 | Active Ragdoll |
| Hit-stop | ✅ | 分级强化 |
| Camera Shake | ✅ | 分攻击级别 |
| Smoke / Dust | 🟡 | 系统化战斗粒子 |
| Stretch / Squash | 🔴 | 战斗形变 |
| Motion Trail | 🔴 | 强攻击 / Throw / Dropkick |
| Angular Physics | 🟡 | 更明显扭转 / 翻滚 |
| Haptics | ✅ | 按动作分类 |
| Combat Audio | 🟡 | 从程序音升级成完整 SFX |
| Big-screen Director | ✅ V1 | 真机调导演频率 |
| Instant Replay | ✅ V1 | 稳定多机位 + PiP |
| 3-minute match | 🔴 | 180 秒阶段结构 |
| Final Phase | 🟡 | 15 秒升级成完整 Final Chaos |
| AI Brawler | 🟡 | 学会抓、踢、武器、复仇、抢夺 |
| FFA | ✅ | 主模式 |
| Team Rules | ⚪ | Waiting Engine 预留 |
| Perks | ⚪ | 基础战斗完成后再做 |

---

# 22. 开发顺序

## Parity Phase A — 核心身体战斗

必须先完成：

1. 180 秒回合；
2. Sprint；
3. Stamina；
4. Punch；
5. Grab Hold；
6. Carry；
7. Directional Throw；
8. Struggle；
9. Jump；
10. Kick；
11. Headbutt；
12. Dropkick；
13. KO / Wake-up。

这一步结束后：

> 即使地图是空桌子，也应该已经很好玩。

---

## Parity Phase B — 战斗表现

完成：

- Smoke；
- Dust；
- Shock；
- Squash；
- Stretch；
- Body Twist；
- Motion Trail；
- Hit-stop 分级；
- Camera kick；
- Haptic 分级；
- 完整 Combat SFX。

---

## Parity Phase C — 武器

先做 3 种：

1. 平底锅：单手近战；
2. 巨型锅铲：双手重武器；
3. 盘子：可投掷物。

三种分别验证：

- 单手；
- 双手；
- 投掷；

三套底层能力。

---

## Parity Phase D — 环境

增加：

- 动态盘子 / 杯子；
- 蒸汽；
- 服务员托盘横扫；
- 地面滑区。

每张地图仍坚持：

**1 个主机关 + 少量辅助事故源。**

---

## Parity Phase E — Director / Replay / Spectacle

在已经有 V1 的基础上继续：

- Throw Follow Camera；
- Dropkick Camera；
- Weapon KO；
- PiP Instant Replay；
- Best Play；
- 8–12 秒自动短视频。

---

# 23. 真正的完成标准

不是“功能列表都打勾”。

而是八个人在一张桌子上能自然发生：

> Sprint 追人
> → 重拳打晕
> → 抓起来拖走
> → 对方醒来挣脱
> → 第三个人飞踢过来
> → 两个人撞到旋转转盘
> → 地上抢锅铲
> → 一个人被锅铲打飞
> → 桌边抓住
> → 被踢手掉下去
> → 导播慢镜头反打回放。

如果这一整条链可以自然发生：

**我们才算真正做到“物理派对战斗基线”。**

然后才进入 Waiting Entertainment 自己的升级阶段。

---

# 24. 我们后续升级的方向

Parity 做齐以后，我们的优势不是继续复制，而是利用餐厅现场场景：

- 手机个人视角；
- 大屏电视导播；
- 自动精彩回放；
- 餐厅环境机关；
- 店铺主题地图；
- AI 永久在线补位；
- 顾客随时进入 / 离开；
- 线下围观；
- 品牌植入；
- 多游戏 Waiting Engine。

所以最终目标不是做另一个 Party Animals。

而是：

> **先达到成熟物理派对乱斗该有的完整度，再把它变成更适合线下公共娱乐的大屏街机。**

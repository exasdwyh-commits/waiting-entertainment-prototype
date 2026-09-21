# Table Push King Game-Feel Tuning

All core feel parameters live in:

```text
server/src/game/tuning.ts
```

The authoritative server remains the only place that decides movement, impact, balance, ledge recovery and cooldowns. The phone and big screen only present the result.

## Fast feedback map

When field testing, report the symptom rather than guessing a numeric fix.

| Real-world feedback | Primary tuning knobs | Direction |
| --- | --- | --- |
| 人物太滑，停不下来 | `movement.linearDamping`, `movement.colliderFriction` | increase |
| 人物太粘，不够灵活 | `movement.linearDamping`, `movement.colliderFriction` | decrease slightly |
| 人物移动太慢 | `movement.impulsePerTick`, `movement.maxHorizontalSpeed` | increase |
| 人物太飘 / 落地太慢 | `world.gravityY` | more negative |
| 冲撞自己冲得不够爽 | `push.lungeImpulse` | increase |
| 撞到别人但击飞不明显 | `push.maxStrength`, `push.verticalHitImpulse` | increase |
| 隔太远也能打中 | `push.hitRange` | decrease |
| 冲撞判定太苛刻 | `push.minimumFacingDot` | decrease |
| 冲撞可以连续乱按 | `push.cooldownMs` | increase |
| 被撞一下就完全失控 | `balance.hitLossBase`, `balance.hitLossScale` | decrease |
| 被撞后没什么感觉 | `balance.hitLossBase`, `balance.knockdownImpactMs` | increase |
| 倒地时间太烦 | `balance.knockdownBaseMs`, `balance.knockdownImpactMs` | decrease |
| 爬起来太慢 | `balance.recoveringPerSecond`, recovery state times | speed up recovery |
| 抓边太容易 | `ledge.hangWindowMs` decrease; `ledge.inwardInputDot` increase | harder |
| 抓边太难 | `ledge.hangWindowMs` increase; `ledge.inwardInputDot` decrease | easier |
| 爬回桌面太像瞬移 | `ledge.climbDurationMs` | increase moderately |
| 爬回过程拖沓 | `ledge.climbDurationMs` | decrease |
| 太容易误触抓人 | `toss.range`, `toss.maxTargetBalance` | decrease |
| 很难触发抓人 | `toss.range`, `toss.maxTargetBalance` | increase carefully |
| 抓起过程太慢 | `toss.windupMs` | decrease |
| 抓起过程看不清 | `toss.windupMs` | increase moderately |
| 甩人不够爽 | `toss.baseStrength`, `toss.verticalStrength` | increase |
| 甩人太夸张 | `toss.baseStrength`, `toss.verticalStrength` | decrease |
| 中央转盘存在感太弱 | `environment.lazySusanImpulsePerTick`, spin speeds | increase carefully |
| 中央转盘太干扰操作 | `environment.lazySusanImpulsePerTick` | decrease |
| 最后10秒转得太疯狂 | `environment.finalTenSpeedMultiplier` | decrease |

## Tuning groups

### Movement

Controls acceleration, top speed, friction and the amount of steering retained while unstable.

The most important relationship is:

- impulse determines how quickly the fighter starts moving;
- damping/friction determine how quickly motion settles;
- max speed prevents runaway acceleration.

Do not increase impulse and reduce damping heavily at the same time unless intentionally testing a slippery mode.

### Push

Controls the one-button attack.

`lungeImpulse` affects the attacker.

`maxStrength` and `verticalHitImpulse` affect the victim.

Keep these separate: a satisfying forward burst does not require launching victims excessively.

### Environment

The first active environment mechanic is the center lazy Susan.

- `lazySusanBaseSpeed`: opening rotation speed;
- `lazySusanMaxSpeed`: late-round rotation speed before the final-ten multiplier;
- `lazySusanImpulsePerTick`: how strongly the center disk nudges fighters tangentially;
- `finalTenSpeedMultiplier`: final-ten-second escalation.

The key tuning rule: the center disk should create trajectory mistakes and collisions, not steal control from the player.

### Toss

The toss is contextual: it only replaces the normal action when a nearby target is already vulnerable.

Key values:

- `range`: how close the attacker must be;
- `maxTargetBalance`: how unstable a target must be before becoming throwable;
- `windupMs`: visible grab/lift time before release;
- `baseStrength`: horizontal throw strength;
- `verticalStrength`: upward component;
- `momentumBonus`: extra reward for entering the grab with speed.

The important design goal is that throwing feels like a payoff for first creating vulnerability, not a universal instant attack.

### Balance

Balance is the bridge between a clean character controller and full ragdoll.

A hit removes balance. Lower balance reduces control and upright assistance. Balance then recovers over time.

This group is the main tool for creating comedy without making players feel they lost control for too long.

### Ledge

Ledge catch is designed as a dramatic rescue opportunity, not a guaranteed safety net.

The three most visible values are:

- `hangWindowMs`: how long a player has to react;
- `inwardInputDot`: how accurately the stick must point toward the table;
- `climbDurationMs`: how long the visible climb takes.

## Recommended tuning discipline

For real-device tests:

1. Change one symptom group at a time.
2. Prefer 10-15% changes before making large jumps.
3. Test at least several collisions near the center and near the edge.
4. Test with 1 human + 7 AI before judging Bot pressure.
5. Re-check phone FPS with `?debug=1` after visual changes.
6. Do not tune physics based only on keyboard local mode; phone input is the target experience.

## Current baseline

The values currently committed are the baseline for restaurant testing, not final balance.

The next meaningful tuning pass should be based on real-device feedback, especially:

- push satisfaction;
- recovery frustration;
- ledge rescue success rate;
- near-edge chaos;
- whether a first-time guest immediately understands cause and effect.

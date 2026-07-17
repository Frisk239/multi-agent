# automation-next-run

## 用户路径

打开 `/automation` → 每条规则看到 **调度摘要 + 下次计划时刻**（及上次）→ 理解「什么时候会再跑」，对齐 Multica autopilot 可读性。

## Must

1. 服务端 `computeNextPlannedAt`（interval grid 下一拍 / daily 今明本地 HH:mm）
2. `AutomationRule.nextPlannedAt` 随 list/get/create/patch 返回；disabled → null
3. UI 列「下次计划」+ `data-testid`；调度列可点 title 看摘要
4. Playwright：有规则时可见下次时间或「—」（停用）

## Out of scope

- 改调度算法 / webhook
- 侧栏自动化角标

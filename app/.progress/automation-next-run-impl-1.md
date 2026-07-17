# Closeout: automation-next-run

> 自动迭代 · main · 2026-07-17

## 交付

1. `computeNextPlannedAt`（dispatch）+ reshape 同语义 next 字段（避循环依赖）
2. `AutomationRule.nextPlannedAt` 随 list/create 返回；disabled → null
3. `/automation` 表增加「下次计划」列；停用显示「停用」
4. 调度列 title 提示下次计划摘要

## 决策

- next 为 **只读计算字段**，不落库
- interval：下一 grid 拍（strictly after now）；daily：今日未到则今日，否则明日
- 与 tick 的 `computeDuePlannedAt`（latest_only 当前拍）刻意不同：UI 看「下一次」，worker 看「是否到期」

## 证据

- typecheck 绿
- API create interval → `nextPlannedAt` ISO；disabled daily → null
- Playwright `/automation`：`下次` 有时刻 + 停用文案；schedule 标签正确

## Multica 对照

| 项 | Multica | 我们 |
|---|---|---|
| 下次计划可见 | autopilot plan 感 | nextPlannedAt 列 ✅ |
| 在途 run | 本会话上一刀 | active-nav ✅ |
| webhook 自动化 | 有 | 不做（宪法纯本地） |

## 债

- push：与 `runs-active-nav`（`a3538f2`）一并推；若仍 443 则本地 ahead
- demo 规则验证后可删（可选）

## 给下一 Owner

- 建议：`issue-comment-mentions` 可见性深化 / CmdK 打开活跃 runs / automation 模板预览

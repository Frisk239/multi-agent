# G5-6 运营统计加深 —— closeout（2026-08-02 第四波 M2）

**刀名：** G5-6 运营统计加深（cycle time / agent 利用率 / 失败率·改派趋势）
**Goal：** G5（可靠性与运营）/ 目标 M2 运营闭环

## 背景与勘察结论

- 目标陈述：「cycle time（issue 创建→done 中位数）、agent 利用率（在途/总时长）、失败率/改派率趋势（按日）——复用 usage/analytics 既有聚合框架，新端点 + 页面小卡片或并入 Usage 页」。
- 既有框架：`routes/analytics.ts`（token-usage 聚合）+ UsagePage（KPI 网格 / by-day / leaderboard）。
- 数据源勘察：
  - cycle time：`issues.createdAt` + `activity_log` `status_changed` 事件 payload `{from,to}`（`to='done'` 最近一次 = done 时刻）。issues 表无 doneAt 列，activity_log 是唯一可靠时间点。
  - 利用率：`agent_runs.startedAt/finishedAt`（截断到窗口）按 agent 聚合。
  - 失败率：`agent_runs.finishedAt` 日分组，failed+timed_out（与 notifyRunTerminal 口径一致）。
  - 改派：`activity_log` `assignee_changed` 事件日计数。

## 改动清单

| 文件 | 改动 |
|---|---|
| `shared/schema.ts` | + `OpsAnalyticsResponse` / `OpsCycleTimeStats` / `AgentUtilizationItem` / `OpsDailyTrendItem` |
| `server/routes/analytics.ts` | + `buildOpsAnalytics(windowDays)`（纯函数，可注入测试）+ `opsAnalyticsRoute`（GET /api/analytics/ops?days=，1..90 默认 30） |
| `server/app.ts` | 注册 opsAnalyticsRoute |
| `web/lib/api.ts` | + `useOpsAnalytics` hook + 类型导入 |
| `web/components/UsagePage.tsx` | KPI 网格下加「运营统计」区（data-testid=usage-ops）：cycle time 中位/均值/P90/样本 · 利用率 top agent · 近 7 天失败率+改派计数 |

## 口径决策

- **窗口语义**：最近 N 个自然日（含今天，今天零点回推），避免 30 天毫秒窗口跨出 31 个日键的 off-by-one。
- **cycle time**：仅统计 `status='done'` 且 activity_log 有 `to='done'` 的 issue（无记录不硬算，samples 诚实为 0）。
- **利用率**：活跃时长 = run 的 [startedAt, finishedAt] ∩ 窗口；分母 = 窗口毫秒数。running 中 run 的 finishedAt 取 now。
- **失败率**：failed+timed_out / 当日总 run（按 finishedAt 归属日）；无 run 为 null。
- **改派**：assignee_changed 事件数（计数非比率，口径诚实标注为「改派 N 次」）。

## 测试与实证

- `routes/analytics.ops.test.ts`（新，契约测试）：真实内存迁移 DB + buildApp.inject。断言：
  - cycle time：done issue（创建→done 300_000ms）samples=1/median=mean=p90=300_000；非 done 的 status_changed（to=in_progress）不计入。
  - 利用率：agt-test-1 活跃 2.5h → activeMs=9_000_000、utilization=2.5h/30d 精确值。
  - 趋势：今天 1 run 0 failed + reassign 1；昨天 1 run 1 failed failRate=1；30 天连续、空日 0 填充。
- `pnpm typecheck` 全绿（shared/web/server）；相关测试 8/8 绿。
- **实证（验收标准：运营统计端点可用，至少两项落地并显示）**：本地真实数据 GET /api/analytics/ops?days=30 →
  - cycleTime 端点返回（真实库 samples=0——本地历史无 status_changed→done 记录，契约测试覆盖有样本路径）；
  - utilization 真实聚合：产品·策划队长 54.7%（23632min）等 top agent；
  - trend 30 天连续，last7 runs=299 / failed=269 / failRate=0.9 / reassign=0；
  - UI：UsagePage「运营统计」区渲染（Playwright 关刀统一验证）。

## 下一刀建议

M3 G4-5b Wiki health 一键报告 + backlink（CONTEXT 下一刀默认）。

# G2-1 Deferred-escalation 惰性升级 closeout（2026-08-02）

> Goal G2 编排闭环 · roadmap §4 队列第 3 刀（半截基建差半截）。状态：**已关 ✅**

## 目标

「任务没人接/agent 卡死无响应」有兜底：`deferred` 状态 + `fire_at` + 清扫器，复用 `escalated_from_run_id` 改派血缘（multica `task.go:799 EnqueueDeferredAssigneeFallback` 模式；roadmap §5 边界：默认路径 = 惰性升级，不做无条件改派）。

## 设计（Slice Owner 拍板）

| 决策 | 选择 | 理由 |
|---|---|---|
| 进入路径 | 演进现有 opt-in `escalateDeferredUnclaimedRuns`：queued 超龄 → 转 `deferred` + 写 `fire_at`（宽限窗） | 贴本仓现状（Slice 42/D5 已有雏形），不做 multica 式 enqueue 双写哨兵行 |
| 升级动作 | 到点 `fireDeferredRuns`：原 run fail（`deferred_escalated`）+ 配 fallback 则建改派子 run（`escalated_from_run_id`）；无 fallback 则只 fail + 终端通知 | 宪法「不做无条件改派」；复用 `insertEscalatedChild` 深度 1 + 部分唯一索引幂等守卫 |
| claim 门 | `deferred` 不进 `CLAIMABLE_RUN_STATUSES`（run-worker 零改动） | deferred 由清扫器专门处理，不参与常规 claim |
| 幂等 | 条件 UPDATE（`fromStatuses:['deferred']`）+ activity 按 runId 去重 | DB 行即锁；天然只升一次 |
| 宽限窗 | 默认 5min（`MA_DEFERRED_FIRE_MS` 覆盖；0=立即） | 用户可在 UI 干预（取消/改派） |
| 默认开关 | 保持 opt-in（`MA_DEFERRED_AUTO_ESCALATE=1` / prefs `deferredAutoEscalate`） | 行为变更需显式开启；Settings 文案已更新为「自动升级」 |

## 改动

| 文件 | 改动 |
|---|---|
| `db/schema.ts` | `status` enum 加 `'deferred'`；`fireAt: integer('fire_at')` 列 |
| `drizzle/0048_deferred_escalation.sql` + `meta/_journal.json` | ALTER TABLE 迁移（登记 idx 48） |
| `shared/src/schema.ts` | `AgentRunStatus` 加 `'deferred'`；`AgentRunFailureReason` 加 `'deferred_escalated'`；`AgentRun.fireAt` |
| `db/reshape.ts` | `toAgentRun` 投影 `fireAt` |
| `orchestration/auto-retry.ts` | `insertEscalatedChild` 加 `opts.allowDeferred`（SQL failure_reason 谓词放宽 `'deferred_escalated'`，attempt 门恒满足）；导出函数 |
| `orchestration/stale-runs.ts` | `getDeferredFireDelayMs()`（默认 5min）；`escalateDeferredUnclaimedRuns` 命中 → `transitionRun queued→deferred` + fireAt + activity payload 加 `deferred:true`；新增 `fireDeferredRuns`（到点 fail + insertEscalatedChild(allowDeferred) + publishFailedRun）；tick 挂载 `fireDeferredRuns` |
| `orchestration/inbox-writer.ts` | `notifyDeferredUnclaimed` 状态检查放宽 `queued`/`deferred` |
| `web RunDetailPage.tsx` | `statusZh` 加「延迟升级等待中」；deferred + fireAt → 「升级于 HH:MM:SS」；改派 note 文案通用化（含无人认领场景） |
| `web SettingsPage.tsx` | 开关文案：转 deferred → 宽限 → 自动升级（配后备则改派，未配则失败提示） |
| 测试 | 新建 `stale-deferred.test.ts`（真库 5 用例：转态+幂等 / 未到点不动 / fallback 升级+深度 1 / 无 fallback 不改派 / fire 幂等）；`schema-migrator.test.ts` 加 `fire_at` 断言；`stale-runs.test.ts` 3 个旧用例更新为新语义；`session-resume.test.ts` 修 mock 路径（`./db/client.js`→`../db/client.js`，**顺带修掉一直失效的 mock**） |

## 真机验收（dev.db + 本地 server，env：`MA_DEFERRED_UNCLAIMED_MS=30000 MA_DEFERRED_AUTO_ESCALATE=1 MA_DEFERRED_FIRE_MS=10000`）

1. pi agent（concurrency=1，1 个 running run 占满槽）→ 插入超龄 queued run → 清扫器 tick 转 `deferred` + `fireAt` 写入 ✅
2. `fire_at` 到点 → 自动升级：源 run `failed` + `failure_reason=deferred_escalated` + error「已自动改派给 产品·策划队长」✅
3. 升级子 run：`escalated_from_run_id`=源 run、agent=fallback（agt-lead）、runtime=opencode、**status=running（fallback 立即开工）** ✅
4. UI：子 run 详情页显示「本 run 由 … 自动升级而来（原 run 无人认领超时…）」✅；deferred 状态 run 详情显示「延迟升级等待中」+「升级于 12:17:05」✅（截图 `.playwright-cli/g2-1-deferred-status.png`）

## 门禁

- `pnpm typecheck` 全仓绿；server 全量 694 passed（89 文件）；web 全量 424 passed
- 新增 5 用例（stale-deferred）+ migrator 断言

## 未做（后续刀）

- G2-2 Autopilot 离线语义 / G2-3 子代理成本汇总 / G2-4 读投影残留清理 / G2-5 全局并发配额
- deferred 状态的 RunsPage 列表角标（详情已可观测，列表低优先）
- escalate 命中时的 inbox 文案区分「已配 fallback 将自动改派」（当前统一「宽限后将自动升级」）

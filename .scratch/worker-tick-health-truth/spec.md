# Slice：Worker tick 健康真实性

日期：2026-08-19

## 用户路径

SQLite 短暂锁定、查询或 claim 发生异常时，后台 worker 不会产生未处理 rejection，也不会继续显示“健康”。Settings 运维卡与 `/healthz` 明确显示是哪一个 worker 连续失败、最近何时失败及安全摘要；worker 不停机，下一轮成功 tick 后自动恢复健康。用户可以据此解释 queued run，而不是看到绿灯后盲猜。

## 参考与裁决

- 对齐 Multica：claim/poll failure 有显式日志和继续循环，健康区分“进程可达”与“可工作的 tick”（出处见 `app/.progress/worker-health-truth-discovery-2026-08-19.md`）。
- 选定：runWorker、automationWorker、wikiIngestWorker 和 staleRunSweeper 全部接入同一 success/failure health 语义；不改它们的业务状态机或重试策略。

## Must

1. `process-health` 增加每 worker 的连续失败数、最近失败时间/限长摘要；失败立即 process degraded，成功 tick 清空 failure；保留既有 `lastTickAt/ageMs/running` 兼容语义，且 health age 基于最后成功 tick。
2. 所有四个 worker 的 timer/wake 顶层异常被 safe wrapper 捕获并 logger 记录：不得留下 unhandled rejection，失败不得调用 success heartbeat，下一轮仍会执行；stale sweeper 也必须把 heartbeat 放到成功末尾。
3. `/healthz`、`/api/ops/snapshot` 和 shared `OpsWorkerHealthSnapshot` 透出新增字段；Settings worker 行把 failure count、失败时间与安全摘要展示为明显 degraded，而不是只显示 age。
4. 单元/契约覆盖：failure → degraded / 元数据；success → 恢复；timer safe wrapper 捕获 rejection；四 worker 的调用路径使用一致语义。现有 health/ops/Settings 不回归。
5. Playwright：Settings 健康页以失败 snapshot 显示 worker failure 文案，恢复 snapshot 后消失；真实 `/healthz`/ops 测试验证失败字段在 API 中存在。

## Out

- 新 daemon、Redis/多进程、全局 job retry、自动化 catch-up、改变 run claim/execute、真实数据库故障注入 endpoint、暴露完整 DB/credential 错误。

## 验证门槛

- 目标 shared/server/web 测试、`pnpm check`
- `node scripts/check-docs.mjs`
- 隔离 current-source Server + Next 的 Playwright Settings 路径

# Worker 健康真实性调研（2026-08-19）

## 结论 / 已选下一刀

取 `worker-tick-health-truth`：将 run、automation、wiki ingest、stale sweeper 的“tick 成功”与“tick 尝试”分开。任何 loop 顶层异常必须被 timer/wake 接住、记录为 worker failure，并让 `/healthz`、ops snapshot、Settings 立即 degraded；下一次真实成功 tick 自动清除失败，不停止 worker。

## 证据

- 本仓 run worker 的 interval/wake 直接 `void tick()`，且 tick 一开始就 `noteWorkerTick`：`app/packages/server/src/orchestration/run-worker.ts:85-116`。若后续 DB/claim 查询抛错，会产生未处理 rejection，同时下一 500ms 再刷新“健康”时间。
- automation 只有启动首轮走 `tickSafe()`，后续 interval 仍是 `void tick()`：`orchestration/automation-worker.ts:29-42`；wiki ingest 同样直接 `void tick()`：`wiki/ingest-worker.ts:27-52`。
- stale sweeper 有 try/catch 但在 try 开头记 tick：`stale-runs.ts:544-565`，因此一次失败仍可能被误写成成功心跳。
- `process-health.ts:90-106` 只看 running + lastTick age，不含失败状态；Settings 仅把 age 拼成文字：`app/packages/web/components/SettingsPage.tsx:1630-1640`。
- Multica batch poller 对 claim 失败显式记录、释放 slot、sleep 后继续：`references/repos/multica/server/internal/daemon/daemon.go:3511-3561`；health 分开“可达”和“可 claim”：`server/internal/daemon/health.go:94-118`。

## 方案

- 每个 Worker 记录最后**成功** tick、连续失败数、最近失败时间和限长错误摘要；失败立即使 process `degraded`，成功清 failure。
- timer/wake 统一 await-safe wrapper，日志保留全错误但不让 rejection 泄出；无需停止循环，下一轮照常尝试。
- `/healthz` / `/api/ops/snapshot` 复用 process-health 投影；Settings 显示失败次数与可读摘要，而不仅是“上次 tick”。

## 排除 / 后续

- 不引入 daemon、队列、Redis、分布式 retry，也不改任何 run/automation/wifi 业务状态机。
- P1 候选为评论线程与结论 UI：本仓已有 parent/resolve 后端，前端仍扁平且不可操作。证据：`app/.progress/next-frontend-ux-discovery-2026-08-19.md`。

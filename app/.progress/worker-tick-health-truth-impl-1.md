# Closeout: worker-tick-health-truth

日期：2026-08-19

## 交付

- 实现提交：`cf53b17 fix(ops): report worker tick failures`
- `run`、`automation`、Wiki ingest、stale-run sweeper 四个常驻 loop 现在只在 tick **完整成功**后写成功心跳；timer/wake 边界统一接住 rejection，记录完整日志且继续下一轮。
- process health 新增连续失败数、最近失败时间与经脱敏、限 240 字的失败摘要；失败立即让 `/healthz`、ops snapshot 和 Settings 进入 degraded，下一次成功会自动清除失败态。
- Settings 将 worker 状态明确标为“上次成功 tick”，并展示可行动的失败次数和安全摘要。启动 worker 本身不再伪造成功心跳，首次成功前保持无年龄状态，避免 startup 被误判 stale。
- 添加隔离 current-source Playwright 验收脚本，覆盖 Settings 的失败快照与成功恢复；同时把 Vitest 4 已失效的 `poolOptions` 迁移成真实生效的 `maxWorkers: 4`。

## 决策

- 对齐 Multica 的 batch poller：claim 失败显式记录、释放资源、延后继续，而不是把一次调度尝试冒充成功；其 health 亦区分可达性和可 claim 性。证据：`references/repos/multica/server/internal/daemon/daemon.go:3511-3561`、`references/repos/multica/server/internal/daemon/health.go:94-118`。
- 选“failure overlay + 下一次成功自愈”，而非停止 worker 或新建 daemon/retry 层：本地单进程下这足以让操作者看见真实故障，同时保留 SQLite 短暂锁冲突后的自动恢复。
- 诊断到全量 server 测试的 WAL `disk I/O error` 并非新 worker 行为：Vitest 4 已移除 `poolOptions`，旧的 4 worker 限制实际未生效，默认全核并发会碰到现有 `dev.db`。重现后以 `maxWorkers: 4` 恢复原并发意图；单 worker 和 capped-4 全量均绿，不以 kill 用户常驻服务或全局 `:memory:` 规避。

## 证据

- 定向测试：shared schema 53 passed；server process-health / healthz / ops / run-worker 43 passed；web Settings 7 passed。
- `pnpm check`：通过（shared 6 files / 128 tests；server 120 files / 1046 tests；web 73 files / 508 tests）。
- `node scripts/check-docs.mjs`：通过（7 entries，7 ADRs，CI freeze）；`git diff --check`：通过（仅 Windows CRLF 提示，无 diff 错误）。
- Owner 独立隔离 current-source Server `:3002` + Next `:3003` + 临时 SQLite 的 Playwright：`pnpm exec tsx scripts/e2e-worker-tick-health-truth.mts` 通过：失败快照显示 count/摘要/degraded，刷新到成功快照后失败 UI 消失；真实 `/healthz` 与 `/api/ops/snapshot` 返回清零的 failure 字段。服务已停止。

## 债 / 边界

- automation 单条 rule dispatch 与 Wiki 单 job 内部已处理的业务失败沿用原有业务错误路径，不将它们误报为 loop 顶层故障。
- 不引入 daemon、队列、Redis、分布式 retry，也不改变 run claim、automation 计划或 Wiki 状态机语义。

## 给下一 Owner

- 取已调研的 P0：Issue 评论线程与结论 UI。后端已有一层 reply + resolve/unresolve，前端仍为扁平 Timeline；按 Multica comment card 接入回复、结论、折叠/展开。调研见 `app/.progress/next-frontend-ux-discovery-2026-08-19.md`。
- 不重开 Runs、Chat 或 G8-4b。

# Queue / terminal observability closeout — 2026-07-30

## Verdict

本刀补齐 execution log 之后的后端硬缺口：年龄算法和终态原因不再由每个页面自行猜测。旧字段保持兼容，新的投影只读计算，不新增迁移。

## Research and decision

- Multica `references/repos/multica/packages/views/issues/components/execution-log-section.tsx:91-166,251-430` 以 active/past、live elapsed、稳定 failure reason 和原任务 retry 作为可观测最小单元；`server/pkg/db/queries/agent.sql:493-531,739-887` 说明队列 claim、lease、stale recovery 必须保留条件转换语义。
- Multica `server/pkg/taskfailure/failure.go:1-37,217-246` 把 failure reason 当稳定 wire taxonomy；Pi `references/repos/pi/packages/ai/src/utils/retry.ts:7-97` 区分 transient retry 与最终失败；Hermes `references/repos/hermes-agent/tools/checkpoint_manager.py:794-849` 说明恢复/运维入口应保留可验证的状态投影。
- 本仓取消路径不写 `failureReason`，因此 `cancelled` 状态优先，不能把任意 error 推断成 `user_aborted`；未知旧 reason 按状态回退。

## Delivered

- `app/packages/server/src/orchestration/run-observability.ts`
  - 统一计算 `queueAgeMs`、`heartbeatAgeMs`、`terminalReason`。
  - 白名单化 failure reason；取消状态覆盖遗留非取消 reason。
- `app/packages/server/src/routes/runs.ts`
  - `/api/runs` list/detail additive 返回上述投影，list 使用同一个 `now` 保证一页内年龄一致。
- `app/packages/server/src/ops-snapshot.ts`
  - `runs.queueSamples` 返回最多 8 条最老 queued/waiting 样本。
  - `runs.terminalReasons` 返回近 7 天聚合、最新终态时间和 `retryable`，窗口按 `finishedAt`，旧行回退 `createdAt`。
- `app/packages/shared/src/schema.ts`
  - 增加 AgentRun observability 字段与 Ops snapshot contracts。
- `app/packages/web/components/SettingsPage.tsx`
  - 运维快照展示队列样本和终态原因；样本链接可跳转 `/runs?status=...&run=...`。
- `app/packages/web/components/RunsPage.tsx`
  - 运行表补充排队/心跳年龄。

## Evidence

- `pnpm typecheck`：shared/server/web 全部通过。
- `pnpm test`：shared 90、server 360、web 208，共 658 tests 通过（含新增 7 个 run-observability tests）。
- Playwright：真实 Settings 环境诊断页加载无业务 console error；运维快照展示终态原因；用 route 注入一个 queued sample 后显示“最久队列样本 / queued · run-ops- / 2m 5s”，点击后 URL 为 `/runs?status=queued&run=run-ops-queued-ui`。

## Remaining hard gaps

- `/api/settings/status.runHealth` 仍只提供聚合年龄，没有逐条 sample；可在下一刀统一复用 observability helper。
- quick-run/chat/event stream 等非 `/api/runs` list/detail 的返回仍保持旧 `toAgentRun` shape；若要全入口一致，应抽 `decorateRunForRead`，但不应把动态年龄写进内部事件状态。
- 灾备 live swap/quiesce/rollback journal、项目级 Wiki 映射仍未做。
- Issue/Squad 详情仍是 transcript 深链，未做 inline transcript preview。

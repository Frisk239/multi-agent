# Bounded infrastructure auto-retry

Status: done

## 用户路径

操作员派发一条普通 Issue Run；若本机执行因可恢复基础设施故障失败，系统在有限预算内自动创建一个 retry child，页面和事件流明确显示“自动重试 n/max、下次时间、原因”，最终成功或停止；不可恢复/用户主动停止的失败只给人工 CTA，不偷偷重跑。

## Must

1. 持久化 retry lineage/预算/下次时间：`attempt`、`maxAttempts`、`nextAttemptAt`、`autoRetryOfRunId`（或等价字段），遵循 additive migration。
2. 严格 allowlist：首版仅 `timeout`、`stale_heartbeat`、`runtime_offline`、`provider_network`；禁止 `auth`、`quota`、`session_poisoned`、`cancel`/`user_aborted`、`exec_error`、`idle_timeout`、`tool_watchdog` 以及未知原因。
3. 失败写入与 retry child 创建具备 DB 条件更新/幂等 guard；同一失败 Run 至多生成一个自动 child，预算耗尽后保持 failed。
4. 首次重试可立即排队，后续使用 bounded exponential backoff（上限明确且可测试）；不与 stale sweeper、人工 retry 或已有 active child 重复派发。
5. Run API/reshape/shared contract 暴露 retry 状态；WS/活动或 Inbox 至少有可追踪事件，Run 列表/详情展示自动重试状态、预算和下次时间。
6. 普通 Issue Run 端到端验证：失败 → 自动 child → child 成功/预算耗尽；人工 CTA 在 retrying 时抑制，终态后恢复。

## Out

- Automation/autopilot linked Run 的自动重试策略（保留为下一刀：规则应等待 retry lineage terminal 后再判失败）。
- 无限重试、auth/quota 自动重试、用户主动取消后的重跑。
- webhook、daemon、Redis、多节点、密钥入库。
- 重写现有人工 retry API；自动 child 复用既有 run-service。

## 参考与约束

- Multica `references/repos/multica/server/internal/service/task.go:3146-3244,2929-3033,3256-3341`
- Pi `references/repos/pi/packages/coding-agent/src/core/agent-session.ts:2527-2596`
- 本仓 `run-service.ts:479-517`、`run-worker.ts:781-832`、`stale-runs.ts:155-220`、`failure-classify.ts:22-96`
- DB 行即锁；不修改 `references/repos/`。

## 验收

- `pnpm typecheck`
- server/shared/web 聚焦 tests：allowlist、幂等、预算、backoff、迟到事件、UI 抑制 CTA
- fresh DB migration
- Playwright CLI：普通 Issue Run 失败 → 自动重试状态/事件 → child Run 深链 → 成功或耗尽
- closeout + commit/push main

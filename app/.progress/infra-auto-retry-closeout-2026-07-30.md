# Bounded infrastructure auto-retry closeout (2026-07-30)

## Verdict

通过。普通 Issue Run 的可恢复基础设施失败现在会在持久化预算内自动排队 child Run；不可恢复失败仍保留人工处理入口。

## Research basis

- Multica `references/repos/multica/server/internal/service/task.go:2929-3033,3146-3244,3256-3341`：失败状态、重试预算、幂等/孤儿恢复与退避必须由持久化状态守住。
- Pi `references/repos/pi/packages/coding-agent/src/core/agent-session.ts:2527-2596` 与 `references/repos/pi/packages/ai/src/utils/retry.ts:7-96`：重试事件应可观测，网络/超时类可重试，认证、配额等不可静默重试。
- 与本仓差异：本仓仍是单机 SQLite + Backend adapter，不引入 daemon/Redis；因此采用 SQLite 条件更新 + lineage 唯一索引，并把 Automation linked Run 留到下一刀。

## Delivered

- `agent_run` 增加 `attempt`、`max_attempts`、`next_attempt_at`、`auto_retry_of_run_id`；迁移 `0041_bounded_auto_retry.sql` 为 additive，旧 Run 默认 1/2。
- allowlist 仅开放 `timeout`、`stale_heartbeat`、`runtime_offline`、`provider_network`；auth/quota/session/cancel/unknown/tool watchdog 等不自动重试。
- 失败转换与 child 创建走同一 SQLite transaction；条件更新、`NOT EXISTS` 与唯一 lineage index 防重复；首次立即排队，后续 bounded exponential backoff，预算耗尽保持 failed。
- worker、stale sweeper、orphan recovery 接入同一调度器；manual retry 与 active child 不重复派发。
- Run API/shared/reshape/WS/activity/storyline/Run detail 展示自动重试状态、attempt/max、next time 与 child 深链；retrying 时抑制 parent 的人工 CTA。
- Automation/autopilot linked Run 明确排除，作为下一刀：等待 retry lineage terminal 后再决定规则成功/失败。

## Evidence

- `pnpm typecheck`：shared/server/web 全部通过。
- server/shared focused tests：6 files / 74 tests passed（auto-retry、allowlist、critical path、stale recovery、run control、schema migration）。
- web focused tests：2 files / 12 tests passed（run recovery、run event timeline）。
- fresh SQLite + real API：`recover-stuck` 将 stale parent 置 failed 并生成唯一 child（attempt 2/2），`GET /api/runs` 返回 lineage/status。
- Playwright CLI：Runs 列表显示“自动重试 1/2 · 自动重试中”；Run detail 显示 child 深链与 2/2；Issue 的故事线/活动事件流显示“Run 自动重试入队”及 parent/child 链接；浏览器路径 0 errors（仅 favicon/开发环境 WebSocket warning）。

## Next slice candidates

1. Automation linked Run 等待 retry lineage terminal，再更新 automation execution truth，避免“建卡成功但执行尚未收敛”。
2. Disaster recovery：SQLite + Wiki manifest/restore 的可操作演练与 Settings 入口。
3. 继续对照 Multica 的 retry/observability 细节，补 queue delay 与 terminal reason 的统一呈现。

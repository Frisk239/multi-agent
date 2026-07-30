# Run observability consistency closeout — 2026-07-30

## Verdict

本刀把上一刀的 observability 投影从 `/api/runs` 扩展到 Settings 健康、Agent/Issue 统计、Agent runs、Quick-create、Chat、Issue rerun 和 Live Runtime Probes。内部状态转换仍使用裸 `toAgentRun`；动态年龄只在公开读模型计算。

## Research and decision

- Multica `references/deep/multica.md:78-148,280-290` 将 `waiting_local_directory` 视为独立的 claim/path-lock 状态，不是 running heartbeat，也不是普通 queued；`references/repos/multica/packages/core/agents/derive-presence.ts:60-80` 将 waiting 纳入 queued workload。
- Multica `references/repos/multica/server/pkg/db/queries/agent.sql:650-665,787-820` 说明 waiting 的 wait reason/lease/recovery 与 running heartbeat 正交；Pi durable harness 和 Hermes ACP 事件也强调实时事件不是 durable read model。
- 因此采用 `toObservedAgentRun(row, now)`：年龄读时计算，生命周期内部仍保持确定的 `toAgentRun`；Settings waiting 健康单独使用 `waitingLocalEnteredAt` + `getWaitingLocalMaxMs()`。

## Delivered

- `app/packages/server/src/routes/settings.ts`
  - 提取可测试 `calculateRunHealth`。
  - active 总数纳入 waiting；增加 waiting 数、最老 waiting 龄、waiting 墙钟阈值、waiting 近收尸数。
- `app/packages/shared/src/schema.ts` / `SettingsPage.tsx`
  - Settings 契约和 UI 展示 waiting 统计、阈值、风险与直达 runs 筛选。
- `app/packages/server/src/db/reshape.ts`
  - 新增 `toObservedAgentRun`，作为公开读入口统一投影。
- `routes/roster.ts`, `routes/quick-runs.ts`, `routes/chat.ts`, `routes/runs.ts`, `orchestration/run-service.ts`
  - Agent runs、Quick-create、Chat、Issue rerun/cancel/queue 响应补齐 age/terminal projection。
- `routes/issues.ts`, `routes/roster.ts`
  - Issue run usage、Agent work stats 不再漏计 `waiting_local_directory` active run。
- `settings-live-probes.ts` / `SettingsPage.tsx`
  - waiting/queued 显示 queue age，running 才显示 heartbeat age。

## Evidence

- `pnpm typecheck`：shared/server/web 全部通过。
- `pnpm test`：shared 90、server 363、web 208，共 661 tests 通过。
- focused tests：Settings run health 4 tests、Live Probes 2 tests 通过。
- Playwright：Settings health card 实际加载；运行健康显示 waiting 统计/阈值/筛选入口，Live Runtime Probes 对 running 显示 heartbeat age。修正后不再重复显示“心跳龄 心跳龄”。

## Remaining hard gaps

- auto-retry child 在 `nextAttemptAt` 未到时仍可能被 Ops queue age/at-risk 聚合误报，下一刀加入 queue eligibility/backoff reason。
- `RunTreeNode` 的 tree/children DTO 尚未带 terminal reason；Ops queue sample 尚未复用 path-lock enrichment 暴露 holder。
- 其他内部 WebSocket 生命周期事件仍保留稳定 `toAgentRun` shape；动态年龄继续只由 GET/read projection 计算。
- 灾备 live swap/quiesce/rollback journal、项目级 Wiki 映射、Issue/Squad inline transcript preview 仍未完成。

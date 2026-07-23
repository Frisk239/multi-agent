# Slice C: 多 Provider 看门狗结构化落库与 Actionable 高密度 Inbox 实施证据

Date: 2026-07-23
Slice: Slice C
Status: ✅ 已完成并验证

---

## 1. 涉及问题与对标
- 对标 Multica (config.go:412-421, daemon.go:5105-5149) 多 Watchdog 守护与 Inbox 高密度快捷交互。
- 实现 Provider 差异化看门狗（OpenCode 10m / Default 30m / Tool 2h）、`failureReason` 结构化落库，以及 Web Inbox 快捷键流 (`j`/`k`/`e`/`r`)。

---

## 2. 代码改动明细
- **[schema.ts](file:///d:/code/multi-agent/app/packages/shared/src/schema.ts) & [server/schema.ts](file:///d:/code/multi-agent/app/packages/server/src/db/schema.ts)**:
  - 扩展 `failureReason: text('failure_reason')` 结构化枚举与字段落库，新增迁移 `0034_agent_runs_failure_reason.sql`。
- **[stale-runs.ts](file:///d:/code/multi-agent/app/packages/server/src/orchestration/stale-runs.ts) & [run-worker.ts](file:///d:/code/multi-agent/app/packages/server/src/orchestration/run-worker.ts)**:
  - 细化 Provider 规则（OpenCode 10m idle），清扫与 failRun 标记时精确写入 `idle_watchdog` / `tool_watchdog` / `stale_heartbeat` 等结构化原因。
- **[InboxPage.tsx](file:///d:/code/multi-agent/app/packages/web/components/InboxPage.tsx)**:
  - 增加 `j/k/e/r` 全局键盘流导航与高密度 Card 行内直接恢复/归档 Action。

---

## 3. 测试与验证
- `pnpm exec tsx scripts/test-watchdog-inbox.mts`: **PASS**
- `pnpm exec tsx scripts/test-issue-idle-timeout.mts`: **PASS**
- `pnpm exec tsx scripts/test-inbox-noise-f10.mts`: **PASS**
- `pnpm typecheck`: **PASS**

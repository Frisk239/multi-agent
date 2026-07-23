# Slice B: 一等 DB 目录锁状态 (waiting_local_directory) 与 Lease 动态续租 实施证据

Date: 2026-07-23
Slice: Slice B
Status: ✅ 已完成并验证

---

## 1. 涉及问题与对标
- 对标 Multica (daemon.go:3345-3430) 的 `waiting_local_directory` DB 状态与锁排队 Lease Extender。
- 为多项目/多 Issue 同路径并发执行时提供透明的锁排队 UI 提示与 Lease 动态续租保护，防止 30 分钟误杀。

---

## 2. 代码改动明细
- **[schema.ts](file:///d:/code/multi-agent/app/packages/shared/src/schema.ts) & [server/schema.ts](file:///d:/code/multi-agent/app/packages/server/src/db/schema.ts)**:
  - `AgentRunStatus` 和 `agentRuns.status` 支持 `'waiting_local_directory'` 一等状态，新增迁移 `0033_waiting_local_directory_status.sql`。
- **[path-lock.ts](file:///d:/code/multi-agent/app/packages/server/src/orchestration/path-lock.ts) & [run-worker.ts](file:///d:/code/multi-agent/app/packages/server/src/orchestration/run-worker.ts)**:
  - `run-worker.ts` 在 `shouldDeferClaimForPath` 为 true 时，将 DB 显式更新为 `waiting_local_directory` 并触发事件；锁释放后自动唤醒排队 Run 并转为 `running`。
- **[stale-runs.ts](file:///d:/code/multi-agent/app/packages/server/src/orchestration/stale-runs.ts)**:
  - 增加 `touchWaitingLocalDirectoryLeases()` 动态更新心跳续租，防止长时间等待被扫盘清理。
- **[RunsPage.tsx](file:///d:/code/multi-agent/app/packages/web/components/RunsPage.tsx) & UI 组件**:
  - 全站支持 `waiting_local_directory` Tag（“等待本地目录锁”）渲染与筛选。

---

## 3. 测试与验证
- `pnpm exec tsx scripts/test-path-lock-waiting.mts`: **PASS**
- `pnpm exec tsx scripts/test-path-serial-c1.mts`: **PASS**
- `pnpm typecheck`: **PASS**

# R4 · mention 闭环完整性 · impl-1 · 2026-07-29

## 本次实际改动

- `packages/server/src/orchestration/comment-trigger.ts`
  - 成功 enqueue 并取得 `runId` 后，记录 `mention_delegated` activity。
  - payload 为 `{ targetId, targetKind, runId }`，沿用 `recordActivityLog` 的持久化与 `activity:created` 广播。
  - 跳过/未创建 run 的 dispatch 不记录该 activity。
- `packages/server/src/orchestration/comment-trigger.test.ts`
  - 聚焦证明成功 dispatch 的 `issueId`、事件类型和 payload。
  - 聚焦证明没有 `runId` 时不记录 `mention_delegated`。
- `packages/web/components/ActivityTimeline.tsx`
  - 为 `mention_delegated` 增加“提及委派”badge。
  - 有 `runId` 时渲染 `/runs?run=<runId>` 深链；没有 `runId` 时不产生无效链接。
- `packages/web/components/ActivityTimeline.test.tsx`
  - 聚焦证明 badge 和 Run 深链渲染。

## 范围说明

本次没有改动 `inbox-writer.ts`、`ws.ts`、`activity-logger.ts` 或 `MarkdownBody.tsx`；这些是复用的既有链路，不列为本次文件改动。

Out：等待真实 CLI leader Run 执行到终态、富文本全量、大规模 mention 场景。

## 实际验证

见 closeout。已执行 fresh DB migration、聚焦测试、全仓 typecheck 与 Playwright CLI 路径验收；未执行 build，未 commit/push。

## 浏览器验收 follow-up

Owner 用 fresh DB 验收时发现 `GET /api/issues/:id/activities` 返回 500：`no such table: activity_log`。根因是表只存在于 `schema.ts`，没有对应 Drizzle migration。

最小修复：

- 新增 `drizzle/0039_activity_log.sql`，创建与 schema 一致的表、Issue 外键（级联删除）和 `idx_activity_log_issue`。
- 更新 Drizzle journal。
- 扩充 `schema-migrator.test.ts`，覆盖 fresh DB 表/列/index/FK，并通过 Drizzle 实际写读 activity。
- 补齐 `RunEventTimeline.test.tsx` 的过时 `AgentRun` fixture，使全仓 typecheck 恢复绿色。

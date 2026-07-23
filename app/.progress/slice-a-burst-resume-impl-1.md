# Slice A: CLI Session Resume & 连发消息打包 (Burst Merging) 实施证据

Date: 2026-07-23
Slice: Slice A
Status: ✅ 已完成并验证

---

## 1. 涉及问题与对标
- 对标 Multica `trailingUserMessages` (daemon.go:2119-2155) 和 Session Resume 机制。
- 解决连发 Chat 消息导致重复并发 `agentRuns` 的竞争开销，并补全 CLI Session ID 保存与 Resume 准备。

---

## 2. 代码改动明细
- **[prompt.ts](file:///d:/code/multi-agent/app/packages/server/src/runtime/prompt.ts)**:
  - 实现 `getTrailingUserMessages` 抓取上一个 `assistant` 回复后的全部 `user` 消息，合并成完整增量 Prompt。
- **[chat.ts](file:///d:/code/multi-agent/app/packages/server/src/routes/chat.ts)**:
  - `POST /api/chat/threads/:id/messages` 增加防重检测：若存在未开工的 `queued` Run，将新消息绑定至该 Run 并更新打包后的 Prompt，避免重复插表。
- **[schema.ts](file:///d:/code/multi-agent/app/packages/server/src/db/schema.ts) & shared/schema.ts**:
  - `chatThreads` 增加 `lastSessionId` 字段，并新增迁移 `0032_chat_thread_last_session_id.sql`。
- **[session-resume.ts](file:///d:/code/multi-agent/app/packages/server/src/runtime/session-resume.ts) & [run-worker.ts](file:///d:/code/multi-agent/app/packages/server/src/orchestration/run-worker.ts)**:
  - Run 完成后自动刷新并持久化 `chatThreads.lastSessionId`，并在解析时优先透传 `priorSessionId`。

---

## 3. 测试与验证
- `pnpm exec tsx scripts/test-burst-resume.mts`: **PASS**
- `pnpm exec tsx scripts/test-chat-slice1.mts`: **PASS**
- `pnpm typecheck`: **PASS**

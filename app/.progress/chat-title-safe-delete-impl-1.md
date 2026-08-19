# Closeout: chat-title-safe-delete

日期：2026-08-19

## 交付

- 实现提交：`7e0a63d feat(chat): add safe title and deletion controls`
- 新增 `PATCH /api/chat/threads/:id`：标题先 trim，再校验 1–200 字符，成功更新 `updatedAt` 并返回完整会话。
- 新增 `DELETE /api/chat/threads/:id`：只接受已归档会话；零关联 run 时删除会话并由 `chat_message` FK cascade 消息；任何关联 `agent_run`（completed、running 等）都返回 409，不置空或删除历史。
- Chat 头栏支持 Enter/blur 保存、Escape 放弃的行内改名；仅 Archived 视图出现二次确认的“永久删除”。删除 409 不乐观移除会话，而是显示「为保留运行记录，无法删除」。

## 决策

- 对齐 Multica 的产品结构：标题行内编辑、归档默认可逆、硬删仅在 Archived view 且要求确认。证据：`references/repos/multica/packages/views/chat/components/chat-session-header.tsx:77-87,169-186`、`chat-thread-list.tsx:58-71,337-379`。
- Multica 之所以能硬删带 history 的会话，是其事务会取消活跃 task，并将历史 task 会话引用 `ON DELETE SET NULL`（`server/internal/handler/chat.go:558-660`、`server/migrations/033_chat.up.sql:20-36`）。
- 本仓 `agent_run.chat_thread_id` 是无 FK 的普通 text，而 worker 仍可能给活跃 thread 写消息；若直接删除会留下无标题 run/孤儿语义。因此选定严格 409 保留策略，记录于 `app/.progress/chat-lifecycle-discovery-2026-08-19.md`。

## 证据

- Shared schema：52 passed；Chat route contract：8 passed；ChatPage error/lifecycle：7 passed。
- `pnpm check`：通过（shared 6 files / 127 tests；server 120 files / 1039 tests；web 73 files / 507 tests）。
- `node scripts/check-docs.mjs`：通过（7 entries，7 ADRs，CI freeze）。
- Owner 独立隔离 current-source Server `:3002` + Next `:3003` + 临时 SQLite 的 Playwright：`pnpm exec tsx scripts/e2e-chat-title-safe-delete.mts` 通过 7 个检查：title trim + list 同步；archive → zero-run delete + message cascade；archive → has-run 409 + `/runs` 仍可见。服务已停止，临时 fixture 均在 finally 清理。

## 债 / 边界

- 故意不支持删除任何带 run 的会话；也不取消/kill 在途 CLI、修改 FK、清除 scratch 或给 run 追加标题快照。
- 后续若要放开此限制，必须先引入独立的历史标题快照/关联策略与 active CLI 事务收尾，不能直接把 `chatThreadId` 置空。

## 给下一 Owner

- 重新以 Multica 与本仓代码为证据调研下一条高频路径缺口；不要开启 G8-4b（仍禁开）。

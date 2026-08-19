# Slice：Chat 标题与安全删除

日期：2026-08-19

## 用户路径

用户打开会话后可在标题处改名，保存后列表和头栏立即一致。归档仍是默认、可恢复的整理动作。只有切到“已归档”列表才会出现“永久删除”；确认后，一个从未生成 run 的会话及其消息被永久删除并回到无选择状态。若归档会话带任意历史或在途 chat run，删除被服务端拒绝，界面明确说明“为保留运行记录，无法删除”，会话仍留在归档列表且 `/runs` 历史未损坏。

## 参考与裁决

- 对齐 Multica：会话头行内编辑（blur / Enter 提交），归档是可逆默认，硬删只在 Archived view 且需要确认。证据见 `app/.progress/chat-lifecycle-discovery-2026-08-19.md`。
- 差异裁决：Multica 的 delete 可事务取消活跃 task 并 `SET NULL` 保留历史；本仓 `agent_run.chat_thread_id` 无 FK/标题快照。选定严格拒绝任何带 run 的 hard delete，而非留下孤儿或删除审计轨迹。

## Must

1. Shared/API：`PATCH /api/chat/threads/:id` 接受 title，trim 后 1–200 字符、更新 `updatedAt`、返回 ChatThread；空白/超长为 validation 400。
2. Shared/API：`DELETE /api/chat/threads/:id` 只接受已归档会话；未归档返回明确 409。若任意 `agent_run.chatThreadId === id`（包含 terminal / active）存在，返回明确 409 且不改 thread/messages/runs；只有 0 run 时删除 thread，让已有 `chat_message` FK cascade。
3. Web：Chat header 标题行内编辑，Enter/blur 提交、Escape 放弃；mutation 刷新会话列表。仅归档列表出现“永久删除”；确认后调用 delete，成功时清当前 `thread` URL 并清理相关 query，409 显示可理解 toast 而非乐观移除。
4. 保持 pin、archive/unarchive、project context、发送/失败重发、chat URL 选择及所有既有 error/loading 状态。
5. 新增 route / component tests 与隔离 current-source Playwright：rename；archive → delete zero-run → URL/list/message 清理；archive → delete has-run → 409/UI 提示且 run 在 `/runs` 可见。

## Out

- FK/迁移、取消或 kill 在途 CLI、清理 scratch、自动标题、运行标题快照、删除任何带历史 run 的会话。

## 验证门槛

- Shared/schema 与 server route 目标测试、Web component tests
- `pnpm check`
- `node scripts/check-docs.mjs`
- 隔离 current-source Server + Next + 临时 SQLite 的 Playwright

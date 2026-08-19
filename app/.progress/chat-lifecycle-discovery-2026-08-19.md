# Chat 生命周期调研（2026-08-19）

## 结论 / 已选方案

取 `Chat title + archive-only safe delete`：标题可编辑；硬删仅在已归档且没有任何关联 `agent_run` 时可执行。只要会话有一条 chat run（终态或活跃均算），服务端拒绝删除并保持归档可见。

这是与 Multica 的刻意差异：Multica 能在同一事务取消活跃任务、将历史任务会话引用置空；本仓 `agent_run.chat_thread_id` 没有 FK，也没有保留的标题快照，直接删除会让 Runs 历史变成无语义断链。为日常本地可观测性，当前切片宁可限制删除范围。

## 参考证据

- Multica 更新标题时 trim、拒绝空值、限制长度：`references/repos/multica/server/internal/handler/chat.go:320-357`；前端是 header 行内编辑、blur/Enter 提交：`packages/views/chat/components/chat-session-header.tsx:77-87`。
- Multica 将归档定义为可恢复只读，并在发送端拒绝：`server/pkg/db/queries/chat.sql:115-124`、`server/internal/handler/chat.go:728-735`；仅归档列表提供硬删：`packages/views/chat/components/chat-thread-list.tsx:337-379`。
- Multica 硬删会在事务内锁会话、取消活跃任务、清理附属数据：`server/internal/handler/chat.go:558-650`；其历史 task 引用是 `ON DELETE SET NULL`：`server/migrations/033_chat.up.sql:20-36`、`server/pkg/db/queries/chat.sql:195-204`。

## 本仓差异

- `agent_run.chat_thread_id` 是无 FK 的普通 text：`app/packages/server/src/db/schema.ts:262-352`、`app/packages/server/drizzle/0016_agent_chat.sql:21-23`。
- `chat_message.thread_id` 是 `ON DELETE CASCADE`：`schema.ts:486-501`；worker 的完成/失败路径仍会写 assistant message（`run-worker.ts:862-881,1041-1057`），所以活跃 run 删除尤其不能放行。
- 当前仅有 list/create/project/pin/archive API；标题静态显示，缺 rename/delete：`app/packages/server/src/routes/chat.ts:95-230`、`app/packages/web/components/ChatPage.tsx:407-483,546-626`。

## 验收方向

- API：空标题 400；未归档删除 409；归档无 run 删除成功并 cascade messages；归档且有 terminal/active run 409 且数据保留。
- UI / Playwright：改名同步列表与头栏；归档后才出现永久删除与二次确认；删除无 run 会清 URL；有历史 run 时提示并可继续在 `/runs` 找到该 run。

## Out

- 将 `chatThreadId` 改 FK、取消/kill 活跃 CLI、删 chat scratch 目录、LLM 自动命名、run 标题快照/历史迁移。

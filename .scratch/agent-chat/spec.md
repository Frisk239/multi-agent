# agent-chat

## Multica 对照
- 真站 `/chat`：会话列表 + 主区「选择对话或新建」+ 历史摘要
- 本刀：人↔指定 agent 的本地会话；发消息 → enqueue run → 回写 assistant 消息

## Must
- DB：chat_thread / chat_message；run.kind=chat + chat_thread_id
- API：list/create threads；list/post messages；发消息触发 run
- run-worker：chat 完成不要求 issue；写入 assistant 消息
- web：/chat 页 + 侧栏入口
- Playwright：打开 /chat、选 agent 新建、列表可见

## Out of scope
- Helper 全局右栏
- 多轮流式 UI 完美复刻
- 云端 chat 同步

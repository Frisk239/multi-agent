# Closeout: agent-chat

## Multica 对照（固化登录）
- `playwright-cli open …/chat --headed --persistent` → loggedIn
- 真站：会话列表 +「选择一个对话，或点 + 新建」+ 历史摘要
- 本刀：本地 `/chat` 双栏 + 新建会话 + 发消息 enqueue `kind=chat` run

## 交付
- DB：`chat_thread` / `chat_message` + `agent_run.chat_thread_id` + kind `chat`（0016）
- API：`GET/POST /api/chat/threads`、`GET/POST …/messages`
- run-worker：chat 无 issue 可 completed；回写 assistant 消息
- prompt：chat 专用简短对话指令
- web：`ChatPage`、侧栏「聊天」、hooks

## 证据
- typecheck 绿；migrate 成功
- API：create thread → post message → run `queued/running` kind=chat；user 消息入库
- Playwright：`/chat` page/split/list/new；点会话 → `?thread=` + composer + bubble

## 决策
- 复用 agent_run 执行，不自造 loop
- assistant 完成依赖 CLI；opencode 长跑时 UI 仍轮询消息（与 QC 相同运行时约束）
- Helper 右栏另刀

## 下一刀
- `helper-rail` 或 chat 流式/完成态强化

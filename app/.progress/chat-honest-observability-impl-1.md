# chat-honest-observability-impl-1（Slice 1）

Date: 2026-07-21  
Branch: main

## 本刀范围
Chat **诚实可观测 + 可恢复**：会话头 cwd mode/path、空态文案、失败人话 + 重发上一条、多轮 prompt 历史注入。

## Multica 对照（短）
- `daemon.go` `trailingUserMessages`（~2639–2656）：session 复用时只投递 last assistant 之后的 user 消息。
- 本仓 **无** CLI session 复用 → **已选**：注入同 thread 最近 N 条 prior 对话（默认 20，`MA_CHAT_HISTORY_LIMIT`）+ 当前 `quickPrompt`。
- cwd：延续 `chatScratchWorkDir` / `MA_CHAT_USE_WORKSPACE_CWD`（`resolve-run-cwd.ts`），UI 只展示服务端 `resolveChatExecContext`。

## 决策
| 项 | 选择 |
|---|---|
| 多轮 | `loadPriorChatMessages` + `formatChatHistoryBlock` 进 `resolveRunPrompt(chat)` |
| cwd 暴露 | `GET /api/chat/threads/:id/exec-context` + detail GET 带 `execContext` |
| 重发 | 取最近 user body，走既有 `POST .../messages`（新 run） |
| 空态 | 去掉「了解工作区 issue」；明示 1:1 + 隔离目录 |

## 改动文件
- `app/packages/server/src/runtime/prompt.ts` — 多轮历史
- `app/packages/server/src/runtime/resolve-run-cwd.ts` — `resolveChatExecContext`
- `app/packages/server/src/routes/chat.ts` — exec-context API
- `app/packages/shared/src/schema.ts` — `ChatExecContext`；timeout 人话
- `app/packages/web/components/ChatPage.tsx` — 头/空态/重发
- `app/packages/web/lib/api.ts` — `useChatExecContext`
- `app/packages/web/app/globals.css` — cwd 行样式
- `app/packages/server/scripts/test-chat-slice1.mts` — gating 测试

## 验收证据
| 项 | 结果 |
|---|---|
| multi-turn prompt | `tsx scripts/test-chat-slice1.mts` PASS（ALPHA-42 prior + 当前消息） |
| cwd mode | default `chat_scratch`/`隔离`；opt-in `workspace`/`工作区` |
| typecheck | `pnpm typecheck` 0 |
| Playwright `/chat` | 空态无「了解工作区」；header `隔离`+`chat-sessions` path；fail card「重发上一条」可点并新开 run |
| 隔离未回退 | 仍默认 `~/.multi-agent/chat-sessions/<thread>/workdir` |

## 下一刀建议
**Slice 2** — 派发硬闸：`cwd_missing` / `runtime_missing` 默认禁止 enqueue；EnvBanner 恢复分流。

## 不做（本刀）
Slice 3/4；run 表 `work_dir`；PriorWorkDir session 复用；云 chat 协议。

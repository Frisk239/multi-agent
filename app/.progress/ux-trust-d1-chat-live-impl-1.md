# UX Trust D1 — Chat 过程可感

Date: 2026-07-22  
Branch: main

## 本刀范围

| 项 | 内容 |
|---|---|
| Must | ThinkingRow：progress + 最近 tool 名 + assistant partial；WS + run-messages 轮询 |
| Out | 真 token SSE、新协议、改 backend 契约 |

## 决策

| 项 | 选择 |
|---|---|
| progress | `useRunProgressStore` 截断 400 |
| tool | `run:message` tool_start → `toolByRunId`；轨迹轮询回填 |
| partial | assistant 消息智能合并（扩展/并列块） |
| 轮询 | live run 时 `useRunMessages` 2s |

## 改动

- `web/lib/ws.ts` · `api.ts` useRunMessages interval  
- `ChatPage.tsx` ThinkingRow  
- `globals.css` tool chip + partial  
- `web/scripts/test-chat-live-d1.mts`

## 验收

| 项 | 结果 |
|---|---|
| typecheck | **PASS** |
| test-chat-live-d1 | **ALL PASS** |

## 下一刀

**D2** 隔离 workdir 复用叙事

## 推送债

main 仍可能 ahead origin；网络恢复后 `git push origin main`。

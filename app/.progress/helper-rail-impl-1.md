# helper-rail · impl-1（G10）

日期：2026-07-19

## 对照

| 源 | 结论 |
|---|---|
| Multica 真站 Issues | FAB「问 Multica」+ 右下浮层 + starter chips + 离线提示 |
| Multica `floating-chat.tsx` / `chat-window.tsx` | FAB+Window；`/chat` 路由隐藏浮层；starter keys list_open/summarize_today/plan_next |
| 本仓 | 已有 `/chat` + thread/message + kind=chat run |

## 决策

1. **复用 chat API**，不新表、不自造 agent loop。  
2. 浮窗绑定可切换 agent；localStorage 记 open/agent/thread。  
3. readiness ≠ ready/busy 时显示离线/不可用横幅，仍允许排队发送。  
4. `/chat` 全页隐藏 FAB/浮窗（同 Multica）。  
5. 不做流式、附件、多 session 列表（全屏聊天页已有）。

## 产物

- `HelperRail.tsx` + layout 挂载  
- CSS：`.helper-fab` / `.helper-rail`  

## 验收

- `/`：FAB → rail → 3 starters → 发 starter 出现 user msg  
- `/chat`：无 FAB/rail  
- typecheck 绿  

## 下一刀

- G1 子 issue / G16 projects / chat 完成态强化

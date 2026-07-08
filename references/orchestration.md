# 编排层参考

> 源码：[repos/multica/](repos/multica/) · [repos/hermes-agent/](repos/hermes-agent/)（kanban 插件）

## multica

**定位：** 开源托管 Agent 平台 — 14+ CLI（Hermes、Pi、Cursor…）变成可分配队友。

**架构要点：**
- `server/` Go + sqlc + WebSocket
- `packages/core` 无头逻辑；`packages/views` 共享 UI
- 本地 daemon 检测并路由 Agent CLI

**必抄设计：**
1. Agent 一等公民 assignee（Human / Agent / Squad）
2. 生命周期：enqueue → claim → start → complete/fail + WS 流
3. Squads 组长路由
4. Autopilot（Cron/Webhook）
5. Skills 复利
6. React Query（服务端）+ Zustand（客户端）+ WS invalidate

**毕设落点：** 编排层主骨架；issue/comment 是 Wiki ingest 的事件源。

---

## hermes kanban

**定位：** SQLite 看板 + gateway 内 dispatcher（hermes 插件）。

**必抄设计：**
- Board 硬边界 / Tenant 软隔离
- `failure_limit` 防死循环
- Worker 专用 toolset（未启用零 footprint）
- Dispatcher：claim → spawn profile

**毕设落点：** 若不做 multica 级 UI，可先做 kanban 增强版作为编排 MVP。

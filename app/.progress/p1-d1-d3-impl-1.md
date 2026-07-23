# P1 切片全量实施证据 (D1 - ErrorBoundary, D2 - WS Heartbeat, D3 - @dnd-kit Board)

Date: 2026-07-23
Slices: D1, D2, D3
Status: ✅ 全部完成并验证

---

## 1. D1 — React ErrorBoundary 全局错误边界
- **[ErrorBoundary.tsx](file:///d:/code/multi-agent/app/packages/web/components/ErrorBoundary.tsx)**: 新建支持 `resetKeys`、`onError` 回调及带重试按钮 Fallback UI 的 Class Component。
- **页面包裹**:
  - [layout.tsx](file:///d:/code/multi-agent/app/packages/web/app/layout.tsx): 全局页面兜底。
  - [IssueDetail.tsx](file:///d:/code/multi-agent/app/packages/web/components/IssueDetail.tsx): `resetKeys={[id]}`。
  - [RunDetailPage.tsx](file:///d:/code/multi-agent/app/packages/web/components/RunDetailPage.tsx): `resetKeys={[runId]}`。
  - [AgentDetailPage.tsx](file:///d:/code/multi-agent/app/packages/web/components/AgentDetailPage.tsx): `resetKeys={[agentId]}`。
  - [ChatPage.tsx](file:///d:/code/multi-agent/app/packages/web/components/ChatPage.tsx): `resetKeys={[threadId]}`。

---

## 2. D2 — WebSocket 心跳保活与客户端重连
- **[ws-broadcaster.ts](file:///d:/code/multi-agent/app/packages/server/src/orchestration/ws-broadcaster.ts)**: 服务端每 30s 广播 `ping` 帧，60s 无 pong 响应自动断开清理。
- **[ws.ts](file:///d:/code/multi-agent/app/packages/web/lib/ws.ts)**: 前端增加指数退避自动重连（1s → 2s → 4s → 8s → 30s MAX），重连成功后触发 React Query 全局 `invalidateQueries`。

---

## 3. D3 — 看板拖拽升级 `@dnd-kit`
- **[KanbanBoard.tsx](file:///d:/code/multi-agent/app/packages/web/components/KanbanBoard.tsx)**: 引入 `DndContext` + `DragOverlay` 悬浮组件，实现半透明跟手拖拽预览。
- **[KanbanColumn.tsx](file:///d:/code/multi-agent/app/packages/web/components/KanbanColumn.tsx)**: 引入 `useDroppable` 与 `SortableContext`，替换原生 HTML5 拖拽事件。
- **[IssueCard.tsx](file:///d:/code/multi-agent/app/packages/web/components/IssueCard.tsx)**: 引入 `useSortable`，拖拽时原位呈现 `opacity: 0.4` 半透明占位。

---

## 4. 测试与验证
- `pnpm -r typecheck`: **PASS (0 Errors)**
- `pnpm exec tsx scripts/test-path-lock-waiting.mts`: **PASS**
- `pnpm exec tsx scripts/test-burst-resume.mts`: **PASS**

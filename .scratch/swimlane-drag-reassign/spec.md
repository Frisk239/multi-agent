# Spec: 泳道跨道拖拽改派

日期：2026-08-21
状态：实施中
上一刀：`webhook-rate-limit`（`app/.progress/webhook-rate-limit-impl-1.md`）
来源：第七刀 Out 项（薄版禁拖）转正；复用看板既有 dnd 与 `useBulkUpdateIssueAssignee`（服务端 bulk-assign 自带 target preflight/skip 语义，`f54546d` 刀）

## 用户路径

泳道视图中，操作者把卡片从 agent A 道拖到 agent B 道的某状态列 → Issue 改派给 B（状态保持目标列状态）；拖回原道/同道跨列 → 状态变更（与看板同语义）；preflight 失败（agent 归档/不可派）→ toast skip 语义与批量改派一致，卡片不动。

## Must

1. `KanbanSwimlaneView` 改为**单层 DndContext** 包全部道（替换第七刀的每道空 sensors 方案）；卡片 draggable（沿用看板卡片 drag handle 语义）；每道每状态列 droppable（id 含 laneKey + status）。
2. `onDragEnd` 语义：
   - 跨道（源 lane ≠ 目标 lane）：调 `useBulkUpdateIssueAssignee({issueIds:[id], assigneeType, assigneeId})`——目标道为 agent 道→`agent:<id>`；squad 道→`squad:<id>`；未指派道→`null/null`。状态 = 目标列 status。改派失败/部分 skip → 既有 toast 语义（bulk-assign 响应含 skip 信息则透传）。
   - 同道跨列：状态变更（复用 `onStatusChange` 既有路径）。
   - 同道同列：无操作。
3. 拖拽视觉：拖动中卡片高亮（对齐看板 is-dragging 现有样式）；目标列 hover 高亮可复用/新增最小样式。
4. 改派后泳道分组自动正确（react-query invalidate 已由 hook 处理）。
5. 测试：跨道拖拽调 bulk assign（参数断言）、同道跨列调状态变更、未指派道 drop → null assignee、preflight 失败不乐观错乱（mock reject 路径）、≥5 用例（dnd 事件可构造 DragEndEvent 直接调 onDragEnd 测）。
6. **Owner 隔离 E2E**：夹具 2 agent 各 1 卡 + 未指派 1 卡 → 泳道拖 A 卡到 B 道（HTML5 dnd 用 page.dragAndDrop 或 dispatchEvent 模拟）→ 卡片移到 B 道 → API 断言 assignee 变更 → 拖到未指派道 → assignee null。

## Out

- 拖拽排序（manual order 在泳道内）、跨视图拖拽、触屏 dnd、改派批量多选。

## 验收

- 泳道内拖拽改派端到端可演示；preflight 失败语义与批量改派一致；board/list 零回归。

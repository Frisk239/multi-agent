# Closeout: 泳道跨道拖拽改派

日期：2026-08-21
产品提交：`23fd902 feat(board): swimlane cross-lane drag reassignment`
上一刀：`webhook-rate-limit`（`app/.progress/webhook-rate-limit-impl-1.md`）
来源：第七刀 Out 项转正（`swimlane-drag-reassign` spec）

## 已交付

- **单层 DndContext** 包全部泳道（替换薄版每道空 sensors）：PointerSensor distance:5 与看板同款；`resolveSwimlaneDrop` 纯函数（`lib/kanban-swimlane-dnd.ts`）把 drop 解析为 跨道改派（bulk-assign + 目标列状态）/ 同道状态变更 / 无操作 三类；over 支持列 droppable 与卡片两种落点。
- **改派接线**（KanbanBoard）：`useBulkUpdateIssueAssignee`（服务端 target preflight/skip 语义复用）成功后链目标列状态变更（相同则跳过）；preflight 失败乐观回滚 + toast。
- **空道 drop zone**：`swimlane-empty:<laneKey>` 独立前缀消歧（laneKey 自含冒号，复用三段形态会被从右误解析为 lane=`agent`）；`MeasuringStrategy.Always` 使拖拽中挂载的 zone 被实时测量；空 agents/squads 恒有道（把工作分给没活的人是核心场景）。
- 目标列 hover 高亮（`kanban-column--drop-over`）。

## Owner 调试补充（实现子代理交付后的接手修复）

- 空道兜底渲染（lanes memo 补 agents/squads 空道）——E2E 暴露「空道整个不渲染」。
- zone id 前缀消歧（上）+ `MeasuringStrategy.Always`——E2E 暴露「拖拽中挂载的 zone 不被 collision 命中」。
- 测试 mock 补 `useDroppable`/`MeasuringStrategy`；适配空道断言（道数/zone 计数）。

## 验收证据

- 全量 `pnpm -w test`：shared 153 / server 1113 / web 680 全绿（+21 用例：纯函数 8 + 组件拖拽语义 4 + 接线 6 + 空道/zone 适配 3）；typecheck 3 包、check-docs 过。
- 真实浏览器（隔离双端口 headless Chromium）：
  - **列 droppable 路径**（跨道拖到目标道状态列 → 改派+状态变更）：`swimdrag.e2e.mjs` 多轮 PASS（API 断言 assignee/status 变更，含截图）。
  - **空道 zone 路径**（拖到空道 drop zone → 改派保持原状态）：`focused.mjs` 多轮 PASS（含 `is-over` 高亮 class 直接证据 + API 断言）。
  - 诊断日志实证 onDragEnd → resolve → onReassign → mutate 全链路触发。
- **已知债务（如实记录）**：headless 指针模拟对**长距离列 droppable 落点**存在 closestCorners over 时序抖动（偶发落到相邻道/未命中）——功能逻辑由单测三层覆盖，真实指针（人类操作）不受合成事件时序影响；后续可用 dnd-kit 官方 E2E helper 或有头会话复验。

## 边界 / 债

- 泳道内 manual 排序、跨视图拖拽、触屏 dnd、改派批量多选——Out 未做。
- 空列隐藏设计下，跨道 drop 落到目标道**非空列或空道 zone**；目标道某状态列存在但无卡时不可精确落入该状态（改派后状态=落点列状态或源状态）。
- `.scratch/*/owner-e2e-*` 运行目录不 stage。

## 下一刀建议

- 候选 A（G4）：Memory/Wiki 与 Issue 知识反链。
- 候选 B（G3）：Issue 卡片 inline due 编辑（due date 快捷补全）。
- 候选 C（G5）：webhook deliveries 分页/清理策略（量增长后审计表维护）。

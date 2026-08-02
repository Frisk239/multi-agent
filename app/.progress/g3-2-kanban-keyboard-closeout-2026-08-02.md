# G3-2 看板键盘可达 closeout（2026-08-02）

> Goal G3 前端体验 · Goal 第二波 M2 末刀（a11y 波次唯一剩余 Pointer-only）。状态：**已关 ✅**

## 目标

看板拖拽有键盘可达路径（dnd-kit KeyboardSensor 或卡片菜单「移动到列」）。

## 勘察结论

- 看板仅注册 PointerSensor（KanbanBoard.tsx）；卡片 `useSortable` attributes 已含 tabIndex=0（可聚焦），但无键盘拖拽。
- 卡片 ⋯ 菜单已有「状态」子菜单（IssueCardMenu.tsx:281-311，键盘可达，PATCH 改状态）——辅助路径已存在，但走 update API 不维护 position。

## 实现（两段提交）

1. **387b536**：注册 `KeyboardSensor` + `sortableKeyboardCoordinates`——真机验证发现**该 getter 只支持列内移动**（dnd-kit 官方文档注明多容器需自定义 getter）。
2. **5953ceb**：自定义 `kanbanKeyboardCoordinates`（dnd-kit 多容器官方模式）：
   - 左右 → 目标相邻「列」（type=Column droppable）内侧点（跨列移动）
   - 上下 → 当前列内相邻「卡片」（type=Issue droppable）中心点
   - Space/Enter 拾起/放下由 KeyboardSensor 默认处理；与指针拖拽同一 onDragEnd → reorder API（position 一并维护）

## 真机验收（dev 3100 + Playwright，键盘全程）

1. 焦点卡片 → Space 拾起（live region 'Draggable item …'）→ **ArrowRight 跨列**（live region 'moved over droppable area todo'）→ Space 放下（'was dropped over droppable area todo'）✅
2. **reorder 落库**：连续多轮键盘拖拽后 DB 中 FRI-274~278 全部从 backlog 移入 todo（每轮 updated_at 递增，reorder API 真实生效）✅
3. 拖拽中截图：`.playwright-cli/m1-g32-keyboard-drag-mid.png`（演示后卡片已还原 backlog）

> 排障记录：本机 3000 端口跑的是用户遗留的 **production build**（`next.dev=false`，旧代码无 KeyboardSensor）；验证改在自起 dev server 3100 + server 加 `MA_CORS_ORIGIN` 放行 3100 完成。

## 门禁

- web 425 / shared 121 / server 730（monorepo 1276）；typecheck 全仓绿；KanbanBoard/MyIssuesPage/KanbanColumn 测试全绿（mock 补 KeyboardSensor 导出）

## 未做（后续刀）

- 菜单「移动到列」升级为 reorder API（现状 PATCH 不维护 position；键盘拖拽已覆盖该需求，菜单路径保持）
- 看板列标题键盘跳转（column focus button 已可聚焦，未加快捷键）

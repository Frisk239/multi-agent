# board-multica-style-7col-impl-1

## 目标
看板视觉与列结构对齐 Multica 真站（用户截图 + `board-column` / `board-card` 源码）。

## 变更
1. **7 列**：`backlog → todo → in_progress → in_review → done → blocked → cancelled`
   - 中文：待规划 / 待办 / 进行中 / 审核中 / 已完成 / **已阻塞** / **已取消**
   - 去掉「cancelled 不建列 / 不渲染」过滤；`?status=cancelled` 可用
2. **列样式**（学 Multica `BOARD_COL_WIDTH=280` + status `columnBg`）：
   - 圆角 12、无硬边框、状态 tint 底
   - 标题 + 计数；「聚焦」hover 才显；空列文案「无 issue」
3. **卡片样式**（学 `BoardCardContent`）：
   - 细边框 surface、标题 2 行 clamp、描述 1 行预览
   - 优先级色点 + identifier 顶行
   - project pill / labels
   - meta：负责人 +「更新于 N 天前」

## 参考
- `references/repos/multica/packages/views/issues/components/board-column.tsx`
- `references/repos/multica/packages/views/issues/components/board-card.tsx`
- `references/repos/multica/packages/core/issues/config/status.ts` STATUS_ORDER / columnBg

## 验收
- [ ] 看板横向 7 列（可滚动）
- [ ] 进行中/审核中/已完成/阻塞有淡 tint
- [ ] 空列显示「无 issue」
- [ ] 卡片有描述预览与「更新于」
- [ ] 拖入已取消列可改状态

# Slice 37 · Kanban 列内虚拟滚动 · closeout

> 2026-07-27 · U6

## 上下文

Slice 29 列表 virtual 后，看板大列仍全量挂载卡片。本刀给 `KanbanColumn` 加列内 virtual，阈值与 list 对齐，拖拽走 MVP/降级说明。

## 本会话完成了什么

| 路径 | 内容 |
|---|---|
| `packages/web/lib/kanban-column-virtual.ts` | 阈值 / overscan / estimate / gap helpers |
| `packages/web/lib/kanban-column-virtual.test.ts` | 纯函数单测（含与 list 阈值对齐） |
| `packages/web/components/KanbanColumn.tsx` | `@tanstack/react-virtual` 列内 virtual；小列全量 |
| `packages/web/app/globals.css` | virtual 列 body 布局（absolute slots） |

## 阈值

- **`KANBAN_COLUMN_VIRTUAL_THRESHOLD = 40`**（与 `shouldVirtualizeIssueList` 默认一致）
- 单列 `issues.length >= 40` → virtual；否则全量 DOM
- overscan：`KANBAN_COLUMN_OVERSCAN = 8`
- estimate card height：compact 104 / default 120 / comfortable 136；gap 4/8/12

## 拖拽策略（MVP / 降级）

- **保留**：`DndContext` + 列 `useDroppable` + 可见卡 `useSortable` + `SortableContext(items=全列 id)` + `DragOverlay`
- **可拖**：virtual 开时仍可从**当前挂载**的卡发起拖拽；落到**列**或**可见卡**仍走原 `handleDragEnd`（改 status / beforeId 重排）
- **降级**：offscreen 卡未挂载 → 无法 hover 到未渲染卡做精确 beforeId；同列精细插入依赖可视窗口。跨列/落列末仍可用。
- 未引入虚拟列表专用 collision 改造；列表 view 无 dnd（Slice 29 已定），本刀不改 list。

## 筛选

列数据仍来自 `KanbanBoard` 的 `issuesByStatus`（基于 `visible` 筛选结果）；列 count / virtual 开关随筛选后的 `issues.length` 变化，不另做服务端分页。

## 自测结果

```text
pnpm --filter @ma/web typecheck  → OK
vitest packages/web/lib/kanban-column-virtual.test.ts
vitest packages/web/lib/issue-list-virtual.test.ts
→ 2 files, 11 tests passed
```

## 偏离

无服务端分页瀑布（Out of scope）。

## 未做 / 债

- virtual 列内精细 collision / auto-scroll 到未挂载卡
- e2e 骨架未加（单测覆盖阈值；可选）
- MyIssues virtual 仍债

## 分支

- `main` 工作区直改 · 未 push

## 给下一 Owner

- 验收：大列 `data-virtualized="1"` 且 `data-virtual-rendered` ≪ count；小列 `data-virtualized="0"`
- 列表 virtual 不回归：`issue-list-virtual` 测试保持绿

# Slice 52 · 看板 Select / 批量条收口（U11）· impl-1

> 2026-07-27 · 实现子代理 · 未 commit / 未 push

## 交付

| 路径 | 内容 |
|---|---|
| `packages/web/components/KanbanBoard.tsx` | 主筛选 + 更多筛选 + 批量条改用共用 `Select`（`ma-select`）；Esc 清选；bulk bar `data-testid` |
| `packages/web/app/globals.css` | `.kanban-bulk-bar` / `.kanban-bulk-select` 与工具栏筛选手感对齐 |
| `packages/server/scripts/e2e-slice52-board-select.mts` | Playwright：筛选 `ma-select` + bulk 改 status 1 条 + Esc 清选 |

## Must

1. ✅ 看板主筛选控件改用共用 `Select`（assignee / priority / origin / project / status）
2. ✅ 批量改状态/指派同样 `Select`；Esc 清选
3. ✅ 不引入 combobox 大重做
4. ✅ e2e `e2e-slice52-board-select.mts`
5. ✅ typecheck web（见证据）

## Out

- 全站 select 扫零
- radix combobox

## testids

- `kanban-assignee-filter` / `kanban-priority-filter` / `kanban-origin-filter` / `kanban-project-filter` / `kanban-status-filter`
- `kanban-bulk-bar` / `kanban-bulk-status` / `kanban-bulk-assignee` / `kanban-bulk-clear` / `kanban-bulk-count`（既有 `kanban-bulk-delete`）

## 验收

```bash
cd D:/code/multi-agent/app/packages/web && pnpm typecheck
cd ../server && pnpm exec tsx scripts/e2e-slice52-board-select.mts
```

## 证据（本地）

- `pnpm typecheck`（@ma/web）绿
- `pnpm exec tsx scripts/e2e-slice52-board-select.mts` → pass=13 fail=0
  - 主/更多筛选均为 `ma-select`
  - bulk bar + bulk status/assignee `ma-select`
  - bulk 改 1 条 → `in_progress`
  - Esc 清选 bulk bar 消失

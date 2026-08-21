# Closeout: 列表表格二阶（列选择 + 分组行）

日期：2026-08-21
产品提交：`c6c7c0a feat(list): column picker and group rows`
上一刀：`kanban-swimlane-view`（`app/.progress/kanban-swimlane-view-impl-1.md`）
调研：Multica 对照扫描候选 4（`table-column-picker.tsx`、`hidden-columns-panel.tsx`）

## 已交付

- **列选择**：可隐藏 6 列（标识/优先级/更新时间/截止/标签/项目），选择框/标题/状态/指派/操作固定；localStorage `issue-list-hidden-cols` 容错解析（非法→空集）；`COL_COUNT` 动态化（colSpan/虚拟化 spacer 同步）。
- **分组行**：`?group=status|assignee|project`（URL 唯一真源，`parseIssueListGroup` 单点在 KanbanBoard.shared）；每组独立 `<tbody>` + 组头行（中文组名+计数 badge，状态用列序、未指派/无项目归组）；组内维持既有排序；分组模式禁用行虚拟化（全量渲染），非分组保持现状。
- **实现子代理中途模型失败**：主体已写完（+957 行），Owner 接手收尾——修 2 个测试断言（组内行查找改为 `closest('tbody')`，实现同步改为每组独立 tbody，DOM 语义更正确）。

## 验收证据

- 全量 `pnpm -w test`：shared 152 / server 1106 / web 89 files / 659 全绿（+16 用例）；typecheck 3 包、check-docs 过。
- 隔离 E2E（fresh DB，脚本 `.scratch/list-table-upgrade/owner-e2e-20260821-1110/list.e2e.mjs`）：**9/9 PASS**——默认优先级列在 → 勾选隐藏表头消失 → 刷新 localStorage 保持 → 按状态分组（待办 2/进行中 1/审核中 1 组头+计数）→ `?group=assignee` 深链（alpha/beta/未指派）→ 组合（截止列隐藏+分组共存）→ 切回不分组。截图 `shots/t2-group-status.png`。

## 边界 / 债

- 列宽拖拽/冻结列/分组折叠/服务端聚合——Out 未做。
- 分组模式 >500 行仅 console.warn 提示（全量渲染保护）。
- `.scratch/*/owner-e2e-*` 运行目录不 stage。

## 下一刀建议

- 候选 A（G5）：webhook 触发频率限制（防脚本误打爆 run；delivery 表已有审计底座）。
- 候选 B（G4）：Memory/Wiki 与 Issue 知识反链（wiki backlink 已有，扩 memory 引用面）。
- 候选 C（G3）：泳道跨道拖拽改派（第七刀 Out 项，复用批量改派 preflight 路径）。

# Spec: 列表表格二阶（列选择 + 分组行）

日期：2026-08-21
状态：已完成（closeout：`app/.progress/list-table-upgrade-impl-1.md`）
上一刀：`kanban-swimlane-view`（`app/.progress/kanban-swimlane-view-impl-1.md`）
调研：Multica 对照扫描候选 4（`views/issues/components/table-column-picker.tsx`、`hidden-columns-panel.tsx`；本仓 IssueListView 固定 10 列无列选择/分组）

## 用户路径

列表视图用户通过「列」按钮勾选要显示的列（偏好 localStorage 持久化，刷新保持）；通过「分组」下拉按 状态/指派/项目 分组，表格出现分组头行（组名+计数），组内维持既有排序；两者可组合，URL `?group=` 可分享分组状态。

## Must

1. **列选择**：可隐藏列 = 标识/优先级/更新时间/截止/标签/项目（6 列）；固定列 = 选择框/标题/状态/指派/操作。列选择面板（`data-testid="issue-list-column-picker"` 按钮 + 面板勾选项，学 Multica hidden-columns 交互：点按钮弹 checkbox 列表，点击外部关闭）；隐藏集合存 localStorage key `issue-list-hidden-cols`（JSON 数组），首载读取，非法值容错为空集。`COL_COUNT` 动态化（固定 5 + 可见可选列数），colSpan/虚拟化 spacer 同步。
2. **分组行**：`?group=none|status|assignee|project`（默认 none，URL 唯一真源，KanbanBoard 传参或 IssueListView 自读 URLSearchParams——按现有 props 模式定）；分组下拉 `data-testid="issue-list-group-select"`（无分组/按状态/按指派/按项目）；分组头行 `<tr data-testid="issue-list-group-row">`：组名（状态中文标签/agent 名/项目名，未指派归「未指派」，无项目归「无项目」）+ 计数 badge，colSpan=当前列数；组间顺序按组名稳定排序（状态用既有列序）；组内维持现有排序逻辑。
3. **虚拟化兼容**：分组模式（group≠none）禁用行虚拟化（全量渲染行），非分组保持现状；分组模式行数上限保护（>500 行时提示分组视图行数较大仍全量渲染——纯 console.warn 即可，不阻塞）。
4. **测试**：列选择面板开关/勾选隐藏列/持久化（localStorage mock）/恢复；分组 URL 解析与下拉写入；分组头行组名计数；状态分组用中文标签；虚拟化在分组下禁用；≥8 用例。
5. **Owner 隔离 E2E**：夹具多状态/多指派/多项目 issue → 列选择隐藏「优先级」列（表头消失+刷新保持）→ 分组按状态（组头行+计数）→ `?group=assignee` 深链 → 组合（隐藏列+分组共存）。

## Out

- 列宽拖拽/固定列冻结、分组折叠展开、分组排序配置、服务端分组聚合、移动端横滚优化、列偏好按用户账号存储（单用户本地）。

## 验收

- 列选择与分组端到端可演示且可组合；默认视图（无隐藏列/无分组）与现网完全一致（零回归）；虚拟化行为分组下有明确降级策略。

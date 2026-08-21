# Spec: 看板泳道视图（按 Agent 分道，薄版）

日期：2026-08-20
状态：已完成（closeout：`app/.progress/kanban-swimlane-view-impl-1.md`）
上一刀：`webhook-payload-template`（`app/.progress/webhook-payload-template-impl-1.md`）
调研：Multica 对照扫描候选 3（`core/issues/stores/view-store.ts:21` SwimlaneGrouping、`views/issues/components/swimlane-view.tsx`；本仓 toolbar 现仅 board/list 两态）

## 用户路径

操作者在看板工具栏切到「泳道」视图（`?view=swimlane`，URL 可分享/刷新保持）：每个 Agent 一条横向泳道（含就绪 chip 与卡片计数），道内按状态列排布其 Issue 卡片；未指派的 Issue 归入「未指派」道；一眼看出各 Agent 负载分布；点卡片名打开既有详情 Sheet。

## 参考与决策

- 学 Multica swimlane 分道形态，但**薄版**：按 assignee agent 分组（Multica 的 parent/project 分组 Out）；**不做跨道拖拽改派**（已有批量改派路径）；卡片复用 IssueCard。
- 视图状态沿用 P2-A 模式（`viewMode: 'board'|'list'` 扩为三态，URL 唯一真源）。

## Must

1. toolbar 视图切换加「泳道」tab（`?view=swimlane`；现有 board/list 深链语义不变）。
2. 新 `KanbanSwimlaneView` 组件：按 `assigneeAgentByIssueId` 分组（agent 道 + 尾部「未指派」道；squad 指派的 issue 归「小队指派」道或并入未指派并标注——按实现简洁选一，spec 拍板：**squad 指派单独一道**，道名=小队名，复用 squad 分组信息）；每道头部：agent 名/小队名 + readiness chip（agent 道）/小队 icon + 计数；道体横向滚动的状态子列（复用 `KanbanBoard.shared.ts COLUMNS`，空列可隐藏或显示计数 0——拍板：**隐藏空列**减少噪声）；卡片复用 IssueCard（点击开 `?issue=` 既有 sheet）。
3. 筛选兼容：q/status/scope/label/project 筛选在泳道视图继续生效（数据源同 visible issues）；`?status=` 聚焦某列时泳道内只显示该列。
4. 空态：无 issue 时泳道区显示既有空态文案。
5. 测试：视图切换 URL 三态、agent 分组与计数、未指派/squad 道、空列隐藏、readiness chip 渲染、卡片点击开详情（≥6 用例）。
6. Owner 隔离 E2E：夹具（2 agent 各有 issue + 1 未指派 + 1 squad 指派）→ 切泳道 → 四道可见计数正确 → readiness chip → 点卡片开 sheet → 刷新保持 → 筛选 q 后道内过滤。

## Out

- 跨道拖拽改派、按 project/parent 分组、泳道折叠/排序、道内排序配置、移动端布局。

## 验收

- 泳道视图端到端可演示（分组/计数/就绪/详情/URL）；board/list 既有行为与测试零回归。

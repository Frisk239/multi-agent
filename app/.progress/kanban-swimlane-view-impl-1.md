# Closeout: 看板泳道视图（按 Agent 分道，薄版）

日期：2026-08-20
产品提交：`af55d67 feat(board): agent swimlane view`
上一刀：`webhook-payload-template`（`app/.progress/webhook-payload-template-impl-1.md`）
调研：Multica 对照扫描候选 3（`view-store.ts:21` SwimlaneGrouping、`swimlane-view.tsx`）

## 已交付

- `KanbanViewMode` 三态 + `parseViewMode`（`KanbanBoard.shared.ts`，URL `?view=swimlane` 唯一真源）；toolbar 第三 tab「泳道」（`kanban-view-swimlane`）。
- `KanbanSwimlaneView`（纯 props）：按 assignee 分道——agent 道名字典序（readiness chip + 计数，归档 agent 名回退 assignee.label/`agent:<id8>`）→ squad 道（icon + 小队名，归档回退）→「未指派」殿后；道体复用 `KanbanColumn`（卡片/readiness/选中/详情/列头快速建卡全免费），空状态列隐藏，`?status=` 聚焦天然单列；每道独立 DndContext 空 sensors（薄版禁拖）。
- CSS 泳道布局（+100 行，复用既有变量）。

## 验收证据

- 全量 `pnpm -w test`：shared 152 / server 126 files / 1106 / web 89 files / 643 = 1901 全绿（+15 用例：组件 9 + 板级 6）；typecheck 3 包、check-docs 过。（一次 server 单文件失败为已知 WAL 并发抖动，复跑 126/1106 全绿。）
- 隔离 E2E（fresh DB，脚本 `.scratch/kanban-swimlane-view/owner-e2e-20260820-1500/swim.e2e.mjs`）：**7/7 PASS**——四道可见（alpha/beta/Squad/未指派）→ alpha 道空列隐藏仅 1 列、beta 道为「进行中」列 → 点卡开 `?issue=` sheet → 刷新保持 → `?q=alpha` 道内过滤仅 alpha 卡。截图 `shots/`。

## 边界 / 债

- 跨道拖拽改派、project/parent 分组、泳道折叠/排序、移动端——Out 未做。
- 泳道内列「聚焦」链接硬编码 `/?status=`（既有行为未改）。
- `.scratch/*/owner-e2e-*` 运行目录不 stage。

## 下一刀建议

- 候选 A（G3）：列表表格二阶（列选择/分组行；调研池候选 4）。
- 候选 B（G5）：webhook 触发频率限制（防脚本误打爆 run）。
- 候选 C（G4）：Memory/Wiki 与 Issue 的知识反链（概念层已有 wiki backlink，扩 memory 引用）。

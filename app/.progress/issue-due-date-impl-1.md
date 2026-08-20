# Closeout: Issue 截止日期全链路

日期：2026-08-20
产品提交：`7d0ac9e feat(issues): due dates across the stack`
上一刀：`archived-squads-browsing`（`app/.progress/archived-squads-browsing-impl-1.md`）
调研来源：本会话 Multica 对照缺口扫描子代理（候选 1/5；`references/repos/multica/packages/views/issues/components/board-card.tsx:100` showDueDate、`views/common/date-only-picker.tsx`）

## 已交付

- **shared**：`DueDate`（`^\d{4}-\d{2}-\d{2}$`）导出；`Issue.dueDate` / `CreateIssueInput.dueDate?` / `UpdateIssueInput.dueDate?`（null=清除、undefined=不动）；export 契约 + 导入容错。
- **server**：migration 0056 `issue.due_date`（text nullable，空库自验过）；POST/PUT/`createIssueCore`/`toIssue`/export/import 全透传。
- **web**：`lib/due.ts` 三态纯函数（本地时区 date-only 字典序比较，今天/明天=soon，当天 23:59:59 边界）；NewIssueForm 原生 date input；IssueCard 日期 chip（`issue-card-due--overdue|--soon`）；IssueListView 第 7 列「截止」可排序（null 排尾）；IssueHeader/IssueDetail 双编辑面（清空即 PUT null）。
- **顺手修既有 bug**：IssueListView 表头（…更新时间, 项目）与行单元格（…项目, 更新时间）错位一列——行内顺序对齐表头。

## 分工

- 实现子代理：全链路实现 + 28 新用例。
- Owner：调研拍板、spec、diff 抽查（迁移 journal/dueState 边界）、隔离 E2E、回归、提交关刀。

## 验收证据

- 全量 `pnpm -w test`：shared 139 / server 1088 / web 87 files / 621 全绿（+43 vs 上刀基线）；typecheck 3 包、check-docs 过。
- 隔离 E2E（fresh DB 含 0056 迁移，双端口，headless Chromium，脚本 `.scratch/issue-due-date/owner-e2e-20260820-1330/due-date.e2e.mjs`）：**11/11 PASS**——API 建卡回显/非法格式 400；看板过期红 chip（`data-due-state=overdue`）+ 明日黄 chip（soon）+ 无日期不渲染；UI 建卡带日期持久化；列表「截止」列显示 + asc 排序过期在前；PUT null 清除后 chip 消失。截图 `shots/`。

## 边界 / 债

- NewIssueDraft 草稿未持久化 dueDate（与 title/priority 草稿行为不一致，小债）。
- 服务端 manual 排序不含 dueDate（与既有列一致）；列表排序为客户端比较器。
- Gantt/提醒/批量改期/自动化 due 联动/按截止分组——Out 未做。
- `.scratch/issue-due-date/owner-e2e-*` 运行目录不 stage。

## 下一刀建议（调研池剩余，按价值排序）

- 候选 A（G5/G2）：**Webhook 触发 Automation**（本地入站 HTTP + HMAC 签名 + 事件过滤 + run-now 派发；Multica `autopilot_webhook.go:343` + deep doc multica.md:227/306 已给 TS 移植要点）。
- 候选 B（G3）：看板泳道视图（按 agent 分道；Multica `swimlane-view.tsx:653`，toolbar 现仅 board/list 两态）。
- 候选 C（G3）：列表表格二阶（列选择/分组行；Multica `table-column-picker.tsx`）。

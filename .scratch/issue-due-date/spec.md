# Spec: Issue 截止日期全链路

日期：2026-08-20
状态：已完成（closeout：`app/.progress/issue-due-date-impl-1.md`）
上一刀：`archived-squads-browsing`（`app/.progress/archived-squads-browsing-impl-1.md`）
调研：Multica 对照缺口扫描（本会话调研子代理，候选 1；出处 `references/repos/multica/packages/views/issues/components/board-card.tsx:100` showDueDate、`views/common/date-only-picker.tsx`）

## 用户路径

操作者新建/编辑 Issue 时设置截止日期（date-only）；看板卡片显示日期 chip——已过期红色、今日/明日黄色、更远灰色；列表视图新增「截止」列并可排序；Issue 详情显示截止日期。过期能一眼看见。

## 参考与决策

- 学 Multica `board-card.tsx:100` showDueDate chip 与 date-only 语义（`YYYY-MM-DD`，不做时分秒）。
- date-only 字符串 + 前端本地时区判定过期（当天 23:59:59 前），服务端只存取不解释。
- 过期高亮三态：`overdue`（< 今天）/`soon`（今天或明天）/normal。

## Must

1. **shared**：`Issue.dueDate: string | null`（YYYY-MM-DD）；`CreateIssueInput.dueDate?`、`UpdateIssueInput.dueDate?`（null=清除）；Zod 校验 `^\d{4}-\d{2}-\d{2}$`。
2. **server**：migration `issue.due_date`（text，nullable）；`POST /api/issues` / `PATCH /api/issues/:id` 写入；`toIssue` 投影 `dueDate`。导出（export）含新字段；导入容忍缺失。
3. **web 建卡/编辑**：新建表单加 date input（`data-testid="issue-form-due-date"`，原生 `<input type="date">`）；Issue 详情编辑区（若详情有编辑表单则同步，否则至少列表/卡片可见+编辑走 PATCH——查详情编辑现状决定，保持本仓一致性）。
4. **web 卡片 chip**：`IssueCard` 有 dueDate 时显示日期 chip（`data-testid="issue-card-due"`），三态样式 class `issue-card-due--overdue|--soon`（复用现有红/黄 CSS 变量）；无 dueDate 不渲染；chip 不参与点击筛选（纯展示，title 提示「截止：日期」）。
5. **web 列表列**：`IssueListView` COLUMNS 加第 7 列「截止」（col `dueDate`，排序支持 null 排尾）；行内显示同三态样式（简化为文本+颜色）。
6. **测试**：shared 契约（合法/非法格式）；server 创建/更新/投影（mock 测试模式）；web 组件（chip 三态、无日期不渲染、列表列与排序）；≥8 用例。
7. **Owner 隔离 E2E**：建卡带过期日期 → 卡片红 chip → 建卡带明日日期 → 黄 chip → 列表「截止」列显示与排序 → PATCH 清除后 chip 消失。

## Out

- 不做 Gantt/时间线、提醒/通知、批量改期、自动化 due 联动、看板按截止分组。
- 不改 priority/label/项目 chip 既有行为；不做自定义日期组件（原生 input）。

## 验收

- 三包全链路绿（typecheck + 全量测试）；E2E 证明过期/临近/清除三态与列表排序；默认无 dueDate 的 Issue 零视觉变化。

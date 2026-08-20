# Spec: automation-skipped-streak-drilldown

日期：2026-08-20
状态：已完成
上一刀 Intake：`app/.progress/automation-rule-archive-preserves-history-intake.md`（通过）
调研：`app/.progress/automation-next-gap-discovery-2026-08-19.md`

## 用户路径

操作者在 `/automation` 看到“连续跳过 N 次”时，点击该告警即可打开同一规则的最近执行；页面请求与 streak 相同的 20 条窗口，先呈现一条跳过汇总（数量、最近计划时刻、摘要），再按需展开查看每条的来源、计划时刻和明确原因。非跳过记录、linked Run 深链和 `pending_dispatch` 的“重新派发”仍按原样可用。

## 调研与决策

- 本仓已在 `GET /api/automation/rules` 中用最近 20 条计算 `skippedStreak`，但 Web 只显示不可点击的文字，展开记录默认请求 8 条并平铺：`app/packages/server/src/routes/automation.ts:52-83`、`app/packages/web/components/AutomationPage.tsx:90-180,1097-1123`。
- Multica 将 skipped 作为有原因但非 failed 的状态，普通 run 保留可行动入口，而跳过记录按数量折叠、需要时才展开：`references/repos/multica/packages/views/autopilots/components/autopilot-detail-page.tsx:77-88,138-170,186-242`。
- 选定：只做前端钻取，复用既有 `limit` query（不增 API/schema/status/scheduler）。告警打开时请求 20 条；在返回窗口中折叠 skipped，其他记录继续原表格路径。`skippedStreak === 20` 显示 `连续跳过 ≥20 次`，不宣称知道窗口外总数。

## Must

1. 连续跳过告警改为语义化 button，键盘可达；点击会自动展开该 rule 的最近执行、把焦点/可见上下文落到 skipped 汇总，并取 `limit=20`。常规“最近执行”和 Run Now 自动展开保持原先较小窗口/行为。
2. 展开的 20 条中把所有 skipped 收为一个可展开组：关闭时展示“已跳过 N 次”、最新计划时刻和最新原因摘要；打开时显示每条原有 `source`、`plannedAt`、`error`。无 skipped 时不出现该组。
3. 非 skipped 行仍完整显示；Issue、linked Run、`pending_dispatch` 的重新派发 CTA 不移动、不降级。
4. 告警阈值仍为连续 3 次；计数小于 20 保持 `连续跳过 N 次`，达到 20 显示 `连续跳过 ≥20 次`，并提供准确 title/辅助文案说明只基于最近 20 条。
5. Web 组件/纯函数测试覆盖 20 条 fetch、button/aria、分组折叠展开、原因、`≥20` 和非 skipped/pending/linked Run 回归；隔离 current-source Playwright 用随机 fixture 放 3 条 skipped + 1 条普通 run，点击告警后验证汇总、展开原因与普通链接。不得使用默认 DB/端口或启动 CLI。

## Out

- 不做新的 Automation 详情页、历史无限分页、全局通知、后端 status/schema/scheduler 改动或 Runs 重构。
- 不改 skipped 的计算口径、阈值、Run Now、reconcile 语义，也不把 skipped 误标为 failed。
- 不做归档列表、恢复或永久清理。

## 验收

- 三条连续 skipped 的 rule 在 `/automation` 显示可点击告警；点击后 rule 自动展开，网络请求为 `runs?limit=20`，先见跳过汇总；展开组后每条来源、时间和原因可读。
- 一条普通 `issue_created` 或 `pending_dispatch` 同时可见，linked Run 与“重新派发”仍能操作；20 条 skip 时明确显示 `≥20`。
- 真实隔离数据库和浏览器路径证明没有创建 Issue/AgentRun/CLI，仅读取和展示已有审计记录。

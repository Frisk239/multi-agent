# 下一轮缺口调研：Automation UX 与运营生命周期（2026-08-19）

范围：只读；排除已关闭的 Run Now truth、worker health、Runs/Issue/Chat/Agents 各已关项，以及实施中的 `automation-schedule-catchup-truth`。Settings「自动化失败规则」已有通用 `/automation?failed=1` 入口，因此不把“再加一个泛跳转”误报为新缺口。

## 排序与推荐

| 排序 | 切片 | 厚度 | 为什么现在值得做 |
| --- | --- | --- | --- |
| **1** | **automation-rule-archive-preserves-history** | M（后端运营） | 当前“删除规则”会级联删除 automation run，连同失败/跳过/待恢复的证据一起消失；这是不可逆的数据与运维闭环破损，且与正在做的 catch-up 独立。 |
| **2** | **automation-skipped-streak-drilldown** | S–M（前端 UX） | catch-up 会增加有意义的 skipped 审计；当前“连续跳过 N 次”只是静态文字，操作者还要找同一行的“最近执行”并翻表。 |

## 1. 后端运营：规则“删除”改归档，保留执行证据

**差异与影响。** 本仓 `DELETE /rules/:id` 真删 `automation_rule`，而 `automation_run.rule_id` 是 `ON DELETE CASCADE`；已经创建的 Issue/Agent Run 仍有来源字段，但规则本身、failed/skipped/pending_dispatch 的原因与可恢复链被抹掉。Multica 的产品 delete 是 archive：停未来触发、默认列表隐藏、保留 runs/tasks/config。

**Must。**

- 为 rule 加 `archivedAt`（迁移/共享 shape/reshape）；DELETE 改原子 `archivedAt=now + enabled=0 + updatedAt=now`，不删行。
- 默认规则列表只列活跃项；worker 已仅取 `enabled=1`，归档后不再调度。保留按 id 的历史 runs 读取。
- archived rule 拒绝 PATCH、run-now 与 pending-dispatch reconcile；已在运行的 Agent Run 不主动取消，只继续同步其历史终态。
- 页面按钮/确认文案改“归档”，明确“停止后续计划、保留执行记录”。

**Out。** 不做永久清理、恢复 UI、归档列表/版本历史、取消已启动的 Agent Run；不碰 catch-up、重试与 Pi。

**风险。** 最大决定点是 archive 时已有 `pending_dispatch`：必须禁止之后的 reconcile，不能在用户归档后又启动新任务；但不倒灌取消已经 linked 的 run。现有 Chat/Label 都有软归档模式，可复用其 API/DB 习惯。

**验收 / Playwright。** 隔离 DB 创建含 `failed` 或 `pending_dispatch`、linked Issue/Run 的规则 → Automation 点击“归档” → 默认列表消失、worker 不再调度、run-now/reconcile 被拒绝；API/DB 断言同一 automation run、Issue、Agent Run 仍在。浏览器确认文案不再承诺“删除执行记录”。

**出处。**

- 本仓硬删：`app/packages/server/src/routes/automation.ts:232-255`；cascade FK：`app/packages/server/src/db/schema.ts:565-623`；当前 UI 文案/按钮：`app/packages/web/components/AutomationPage.tsx:414-421,1177-1184`。
- 可复用的本仓软归档先例：`app/packages/server/src/routes/chat.ts:97-105,230-245,309-315`、`app/packages/server/src/routes/labels.ts:18-27,117-129`。
- Multica delete=archive：`references/repos/multica/server/internal/handler/autopilot.go:1055-1083`；归档后 runs/tasks/config 保留的集成测试：`references/repos/multica/server/internal/handler/autopilot_subscriber_test.go:600-711`。

## 2. 前端 UX：连续跳过告警可直接钻取原因

**差异与影响。** 本仓已从最近 20 条计算 skipped streak，也显示 `⚠ 连续跳过 N 次`，但告警不可点击；记录区默认只请求 8 条、所有状态平铺。Multica 把 skipped 明确当作非 failure 的有原因状态，并将跳过项按数量折叠，按需展开明细；这特别契合 run-only 离线和新 catch-up 的“明确跳过、人工补救”。

**Must。**

- 将 `连续跳过` 改为可访问按钮：点击展开该 rule 的最近执行并把 skipped 明细作为焦点；这一路取 20 条，匹配现有 streak 计算窗口。
- 在展开记录中将 skipped 折叠成一组：先显示数量、最近计划时刻和摘要；展开后显示原有 `source / plannedAt / error`。非 skipped 行、linked Run、`pending_dispatch` 的“重新派发”不变。
- streak 达 20 时显示 `连续跳过 ≥20 次`，不把截断窗口装作完整总数。

**Out。** 不建 Automation 详情页、不改 API status/schema/scheduler、不过度扩展为全局通知或 Runs 重构。

**验收 / Playwright。** 隔离 fixture 放同一 rule 连续 3 条 skipped（runtime/cwd 或 catch-up 原因）和一条普通 run → `/automation` 点告警 → 自动展开，先见跳过汇总、再见每条原因；普通 run 及其 link 保持可用。组件测试另钉住 20 条窗口的 `≥20` 文案。

**出处。**

- 本仓 streak 的 20 条上限：`app/packages/server/src/routes/automation.ts:52-83`；静态告警：`app/packages/web/components/AutomationPage.tsx:1097-1123`；当前 8 条平铺记录与 pending CTA：`app/packages/web/components/AutomationPage.tsx:90-180`。
- Multica 对 skipped 的非失败语义及原因：`references/repos/multica/packages/views/autopilots/components/autopilot-detail-page.tsx:77-88,138-170`；数量折叠与按需展开：`autopilot-detail-page.tsx:186-242`。

## 未取候选

- Settings 的精确 rule/run 深链仍可做，但已有 `/automation?failed=1` 与 Settings 的两个入口，收益低于上面两条：`app/packages/web/components/SettingsPage.tsx:1219-1234,1402-1404,1663-1672`。
- “stale dispatching 收尸”已是当前 catch-up spec 的 Must，不能并行重复立项。

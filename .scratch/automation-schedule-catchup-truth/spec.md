# Spec: automation-schedule-catchup-truth

日期：2026-08-19
状态：已完成
实现提交：`c2800bc feat(automation): audit missed schedule slots`
上一刀 Intake：`app/.progress/automation-run-now-truth-intake.md`（通过）
调研：`app/.progress/automation-catchup-discovery-2026-08-19.md`

## 用户路径

本机从休眠、关机或服务重启恢复后，启用的 Automation 不会在任意恢复时刻悄悄迟到派发，也不会回放一长串旧任务：最多处理最新一个计划 slot。若最新 slot 已超过 5 分钟，则规则的“最近执行”出现一条明确的“本机未运行，未补跑”记录；下一新 slot 仍正常执行，人工也仍可点“立即执行”补救。

## 调研与决策

- Multica Autopilot 从持久 plan/`last_fired_at`/创建时间锚定，最多回看 24 小时，只取最新遗漏 slot；超过 5 分钟就不触发，避免长停机回放：`references/repos/multica/server/internal/scheduler/jobs_autopilot.go:33-38,220-315`，通用策略见 `scheduler/spec.go:23-38,118-129`。
- Multica 对过期 slot 返回空计划、不写 execution；本仓已有 `automation_run(source='schedule', status='skipped', error, planned_at)`、唯一 `(rule_id, planned_at)` 和最近执行 UI，因此有意增强为一条幂等 skipped 审计，避免本地用户看不出计划为什么没有发生。
- 本仓目前 `computeDuePlannedAt` 只从当前时间取 cron 上一档/interval 当前格/daily 今日时刻，完全不读取持久 anchor；worker 启动立即 tick：`app/packages/server/src/orchestration/automation-dispatch.ts:62-92`、`automation-worker.ts:15-49`。
- 选定：不引入通用 lease scheduler/新表/新 enum。为 schedule tick 加纯 planner 和最小审计写入；手动 `run-now` 不可改变 schedule anchor。

## Must

1. 对 **schedule tick** 计算一个 latest-only 计划：锚点为最后一条 `source='schedule'` AutomationRun（无则规则 `createdAt`），最多回看 24 小时；manual run 的 `lastPlannedAt` 不能吞掉遗漏的 schedule slot。
2. 对 interval / daily / cron 都只取 `anchor < plannedAt <= now` 的最新 canonical slot。slot 距 now **≤5 分钟**走现有 `dispatchAutomationRule(..., 'schedule')`；超过 5 分钟只写一条 `source='schedule' + status='skipped'`，错误说明“本机未运行，未补跑”，不得建 Issue 或 AgentRun。
3. skipped 审计与正常派发都复用 `(rule_id, planned_at)` 幂等；重复 tick/重启不重复。任何 UI 水位写入不得由旧 slot 倒退。
4. 既有 `dispatching` schedule 占位仍要被重新交给原有 preflight：未超龄保持等待，超龄仍升级 `failed`，不能因新的 anchor planner 永远跳过它；`pending_dispatch` / retry / run_only 离线语义不变。
5. 纯 planner、真实 SQLite/worker 测试覆盖：窗口内 latest-only、窗口外唯一 skipped 且零副作用、重启/重复、下一新 slot、manual 不影响 anchor、cron/daily/interval 和 stale dispatching。用独立 current-source Playwright 显示一条真实 schedule skipped 的既有“最近执行”，不触碰默认端口/DB，不启动 CLI。

## Out

- 不做 `every_plan` 回放、可配置窗口 UI、通用多节点 scheduler/Redis/新 lease 表。
- 不改 AutomationRun enum/数据库迁移、现有 manual route、dispatch 的 pending/retry 策略、超龄 dispatching 收尸规则。
- 不把 Settings 精确 rule/run 深链混入本刀（后续小 UX 候选）。

## 验收

- 冷启/休眠固定时钟：规则错过多个 slot 仅考虑最新一个；五分钟内派发，窗口外落一条可读 skipped 审计；下一新 slot恢复正常。
- 数据库：对应 stale slot 仅一条 `automation_run`，无 Issue/linked AgentRun；手动 run 后仍可发现遗漏 schedule slot。
- 浏览器：Automation 页面“最近执行”能显示该 skipped 和原因；随后“立即执行”保持既有人工补救语义。

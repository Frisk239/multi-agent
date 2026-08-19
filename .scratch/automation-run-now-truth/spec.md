# Spec: automation-run-now-truth

日期：2026-08-19
状态：已完成（产品实现 `fa04328`）
上一刀 Intake：`app/.progress/agent-direct-issue-create-intake.md`（通过）

## 用户路径

操作者在 `/automation` 对一条规则点击“立即执行”后，看到的是该次派发的真实领域结果：已建卡/已派发运行才是成功；已跳过或仍在派发/重试会给可理解的警示并展开该规则的最近执行；需要恢复的 pending dispatch 仍保留诊断入口；无法识别的结果不会被误报为成功。

## 调研与决策

- Multica 把 HTTP 2xx 与业务成功分开：仅 `issue_created`、`running` 为成功，`skipped` 是 warning，`failed` 与未知值为 error；见 `references/repos/multica/packages/views/autopilots/components/run-now-toast.ts:1-54`、`autopilot-detail-page.tsx:722-744`。
- 本仓 `POST /api/automation/rules/:id/run-now` 会稳定返回 `201 + AutomationRun`，但并不承诺业务成功：`app/packages/server/src/routes/automation.ts:241-275`；run-only 离线会返回 `skipped + error`，create-issue 离线会返回 `pending_dispatch`：`app/packages/server/src/orchestration/automation-dispatch.ts:293-379,478-498`。
- 现有 Web 除 `pending_dispatch` / `failed` 外全部 `toastSuccess`，因而把 `skipped`、`dispatching`、`retrying` 与未来状态说成成功：`app/packages/web/lib/api/automation.ts:101-157`。
- 选定方案：在 Web 增加运行时安全的纯结果分类与 warning toast；复用现有最近执行、pending repair CTA 与 linked Run，不改 server/schema/调度语义。

## Must

1. 引入可单测的 `classifyAutomationRunNowOutcome(status: string | null | undefined)`。只有 `issue_created`、`running` 是 success；`skipped`、`dispatching`、`retrying` 是 warning；`pending_dispatch` 保持现有 error + CTA；`failed`、`success`、空值和未知/未来值为 error。
2. `useRunAutomationNow` 的 toast 只依赖上述分类，不因 HTTP 201 直接宣告成功。run-only `issue_created`（没有 Issue、但有关联 Run）应称“已派发运行”，不能称“已创建 Issue”。
3. 新增最小 warning toast 视觉/语义变体；`skipped` 显示后端 `error` 原因，`dispatching/retrying` 显示仍在派发/重试中的事实。
4. 每种非成功结果都自动展开当前规则的既有“最近执行”；不得丢掉 `pending_dispatch` 现有 Issue/Settings CTA、RuleRuns 的重新派发和 `automation-linked-run` 深链。
5. 覆盖全量当前/未知状态的纯函数与 hook/UI 回归；以独立 current-source Playwright 真实跑一条 run-only offline→skipped 路径，确认 warning、原因、展开记录和真实 AutomationRun。其余不可自然构造的 transitional/unknown 分支可由浏览器受控响应验证，不能替代真实主路径。

## Out

- 不改 shared enum、数据库/schema、Automation route、dispatch 幂等、scheduler、重试或 catch-up。
- 不用客户端 readiness 数据禁用“立即执行”，不改变 create-issue 离线仍应留下持久审计的策略。
- 不加新 Automation dashboard、通知系统、Pi UI 或多节点/队列能力。

## 验收

- Web 定向 Vitest：状态分类、toast 类型/文案、非成功展开、pending CTA/linked Run 不回归。
- 现有 server run-only/create-issue automation 契约测试回归。
- 独立 SQLite + current-source server/web Playwright；不得使用或停止用户 `:3000/:3001` 服务，不执行本机 CLI。

## 实现结果

- `fa04328 feat(automation): report run now outcomes`：Web 用严格白名单区分 success / warning / error；run-only 成功改称“已派发运行”；非 success 自动展开当前规则的最近执行。
- 真实隔离 Playwright 已验证 `runtime_missing + run_only → skipped`：warning 含服务端原因、最近执行自动展开、SQLite 中有同一条 `AutomationRun`，且 `agent_run=0`。

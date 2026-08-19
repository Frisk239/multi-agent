# Intake: automation-schedule-catchup-truth

日期：2026-08-19
上一刀实现：`c2800bc feat(automation): audit missed schedule slots`
上一刀关刀：`946c0c3 docs: close automation schedule catchup slice`

## Verdict：通过

- 两个提交均已在 `origin/main`；实现提交只含 Automation planner/worker、固定时钟 tests、隔离 e2e 和 `.next-*` 构建缓存忽略规则，没有 DB、Wiki、密钥或用户本地 `.memory/` / `.zcode/` 产物。
- Owner 重跑了三包 TypeScript、`pnpm test`（shared 130、server 1058、web 562）、`node scripts/check-docs.mjs` 与 `git diff --check`。
- Owner 用临时 SQLite、Server `:3002`、Web `:3003` 实跑 current-source Playwright：真实 worker 30 秒 tick 只落 schedule/skipped 审计，最近执行显示中文原因，零 Issue/AgentRun；默认服务未触碰，隔离服务已停。
- 抽查的关键验收均成立：手动 run 不作为 schedule anchor，旧 slot 不会回退水位，stale/fresh `dispatching` 仍遵循既有收尸语义。

## 交给下一刀

取 `automation-rule-archive-preserves-history`：现有 DELETE 会随 `automation_rule` 的 FK cascade 抹掉所有 AutomationRun。把该动作改为归档，停止未来派发并拒绝归档后的 edit/run-now/reconcile，同时保留可读的 execution 证据；调研见 `app/.progress/automation-next-gap-discovery-2026-08-19.md`。

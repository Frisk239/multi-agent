# Intake: automation-rule-archive-preserves-history

日期：2026-08-20
上一刀提交：`06f5185 feat(automation): archive rules with history` + `04101e4 docs: close automation archive slice`

## 验收结论

**通过。** migration 0054 已在新 SQLite 上真实执行；DELETE 归档保留 rule、AutomationRun、Issue、AgentRun，默认列表隐藏而按 id/runs 历史可读。PATCH、Run Now、pending reconcile 都稳定返回 409，worker 与 dispatch 还各有 archived 生命周期守卫。

## 证据与边界

- `pnpm test`：shared 131、server 1062、web 564；三包 TypeScript 与 E2E 脚本静态检查通过。
- Owner current-source Playwright：新 migrated/seed DB，Server `:3002`、Web `:3003`，随机 disabled fixture；归档 UI、保留链与三处 409 全通过，无 CLI，服务已停。
- E2E 对非默认 origin 先校验 CORS allow-list；运行时需让隔离 server 的 `MA_CORS_ORIGIN` 包含 Web origin。无归档列表/restore/永久清理，也不取消已启动 CLI。

## 下一刀建议

取 G3-15 `automation-skipped-streak-drilldown`：将 20 条窗口内“连续跳过”告警变成一键展开的 skipped 原因组，并在正好达到窗口上限时显示 `≥20`，而非虚称完整总数。

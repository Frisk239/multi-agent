# Closeout: automation-rule-archive-preserves-history

日期：2026-08-20
产品提交：`06f5185 feat(automation): archive rules with history`

## 已交付

- 新增 migration `0054_automation_rule_archived`：`automation_rule.archived_at` 进入 Drizzle、reshape 与 shared `AutomationRule` 契约。新规则为 `null`，已有 rule/run 不迁移、不删除。
- 保留 `DELETE /api/automation/rules/:id` HTTP 兼容面，但它现在是原子、幂等的归档：首次写入 `enabled=0`、`archivedAt`、`updatedAt`；重复 DELETE 保留原始归档时刻并返回 204。默认规则列表隐藏已归档项，按 id 与 `/runs` 仍可读取完整历史。
- 归档后 PATCH、Run Now、pending-dispatch reconcile 都返回 409，且没有新 AutomationRun、Issue 或 AgentRun。worker 同时筛 `enabled=1` 与 `archivedAt IS NULL`；派发入口在占位和副作用前另做生命周期守卫，覆盖 worker 已取到旧快照与 Run Now 的窄竞态。既有已启动 Agent Run 不被取消。
- `/automation` 的动作、确认框与成功 toast 全部改为“归档 / 停止后续计划 / 保留执行记录”，归档成功后规则从日常列表消失，不再错误承诺会删除历史。

## 参考与决策

- 对齐 Multica Autopilot 的 delete=archive：停未来触发、默认隐藏，却保留 run/task/config 证据：`references/repos/multica/server/internal/handler/autopilot.go:1055-1083`，集成证据见 `autopilot_subscriber_test.go:600-711`。
- 本仓原实现物理删除 rule，而 `automation_run.rule_id` 的 FK cascade 会抹掉 failed/skipped/pending 的原因。选择最小 nullable timestamp，而非改 FK、另建 archive 表或引入 restore 工作流；这样 catch-up 的 skipped 审计与 pending 恢复链都还可追溯。
- 归档是停止**尚未开始**的后续派发，不倒灌取消已经完成 claim 或正在运行的 CLI；这保持本地执行的历史真实性，也符合本刀 Out。

## 验收证据

- 真实 SQLite/Fastify contract 覆盖 failed/skipped/pending 三种 history、linked Issue/AgentRun 存活、默认列表隐藏、按 id/runs 可读、PATCH/Run Now/reconcile 409、重复归档不改时间；dispatch 与 worker 回归另钉住 archived 的 schedule/create_issue、manual/run_only 均不会生成 placeholder、Issue 或 AgentRun。
- Owner 用新迁移、seed 的隔离 SQLite 实跑 current-source Playwright：Server `:3002`、Web `:3003`，随机 disabled fixture，浏览器确认文案后归档；UI 消失、数据库 history/Issue/AgentRun 保留，三个阻断动作全为 409，无 CLI。默认端口和用户 DB 未触碰，服务已停止。E2E 现在还在启动时检查 `archived_at` 与浏览器 origin 的 CORS allow-list，漏设 `MA_CORS_ORIGIN` 会快速给出可行动错误。
- `pnpm test` 通过：shared 6 files / 131 tests、server 124 / 1062、web 80 / 564；shared/server/web TypeScript、E2E 脚本静态 TypeScript、`node scripts/check-docs.mjs`、`git diff --check` 通过。

## 边界 / 下一刀

- 不提供归档列表、restore、永久清理、批量归档或版本历史；已运行的 CLI 继续按既有状态同步。没有改 retry、catch-up 或通用 scheduler。
- 下一刀取 G3-15 `automation-skipped-streak-drilldown`：把静态“连续跳过 N 次”改为一键展开 20 条窗口中的跳过原因组，并诚实显示 `≥20` 截断边界。

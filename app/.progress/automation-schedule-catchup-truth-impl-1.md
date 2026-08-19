# Closeout: automation-schedule-catchup-truth

日期：2026-08-19
产品提交：`c2800bc feat(automation): audit missed schedule slots`

## 已交付

- Automation worker 的 schedule tick 改为 source-aware、latest-only planner：锚点只取最后一条 `source='schedule'` 的 AutomationRun；没有排程记录才回退规则 `createdAt`，所以手动 Run Now 不会吞掉休眠期间的排程事实。
- interval、daily 和 cron 都只考虑 24 小时窗口内、严格晚于锚点的最新 canonical slot。它在 5 分钟内照旧走既有幂等派发；超过 5 分钟则只写一条 `source=schedule / status=skipped`，原因为“本机未运行，未补跑（错过计划时刻超过 5 分钟）”。
- 过窗审计复用既有 `(rule_id, planned_at)` 唯一键，重复 tick 或重启不会重复写入，且不会创建 Issue、AgentRun 或唤醒本机 CLI。`lastPlannedAt` 同时改为单调水位，旧 slot 不会倒退 UI 读模型。
- 已有 schedule `dispatching` 占位会先走原 preflight：新鲜占位继续等待并阻止叠加新 slot；超龄占位照既有语义转 `failed`，再恢复规划。没有改变 pending/retry/run-only 离线语义。
- 隔离 Next 产物现由 `app/.gitignore` 忽略 `.next-*/`，避免 current-source e2e 遗留构建缓存污染工作树。

## 参考与决策

- 对齐 Multica Autopilot 的持久锚点、24 小时 latest-only 和 5 分钟迟到上限：`references/repos/multica/server/internal/scheduler/jobs_autopilot.go:33-38,220-315`，策略模型见 `scheduler/spec.go:23-38,118-129`。
- Multica 对过期计划返回空、不留 execution；本仓已有 `automation_run` 的 skipped/error/最近执行 UI，因此有意增强为一条可审计 skipped 记录。这让笔记本睡眠后的“不执行”可见，而非把它误装成成功或悄悄回放。
- 未引入通用 scheduler、租约、Redis、新表、schema migration 或 every-plan replay；本地单进程只复用已有执行记录和唯一键。

## 验收证据

- 新 fixed-clock SQLite tests 覆盖 interval/daily/cron、最新 slot、24 小时窗口、≤5 分钟正常派发、>5 分钟零副作用 skipped、重复/restart、manual anchor、单调水位和 stale/fresh `dispatching`：`automation-schedule-catchup.test.ts`。
- Owner 独立 current-source Playwright 通过：临时 SQLite、Server `:3002`、Web `:3003` 的真实 30 秒 worker tick 写入 `schedule/skipped`；Automation 的“最近执行”可见中文原因且没有 linked Run。默认 `:3000/:3001` 与用户 DB 未触碰，隔离服务已停止。
- 三包直接 TypeScript 检查通过（Web 使用 workspace 内可用的 TypeScript 二进制，未修补本地 `.bin/tsc` shim）。
- `pnpm test` 通过：shared 6 files / 130 tests、server 123 / 1058、web 80 / 562；`node scripts/check-docs.mjs` 与 `git diff --check` 在文档收尾后复跑。

## 边界 / 下一刀

- 独立 e2e 必须显式提供非默认 `SERVER`/`WEB` 与文件名含 `e2e` 的 SQLite；脚本先以随机 rule 验证 server 连接该库，再做浏览器动作，并 finally 清理 fixture。
- 下一刀取 `automation-rule-archive-preserves-history`：现有 DELETE 会 cascade 抹掉 failed/skipped/pending 的执行证据。改为 archive（停止未来派发、保留历史）后，再取 G3-15 连续 skipped 告警的一键钻取。

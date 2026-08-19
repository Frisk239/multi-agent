# 下一刀调研：自动化休眠后的 latest-only 与过窗审计（2026-08-19）

## 结论

**推荐下一刀做 `automation-schedule-catchup-truth`（M）**。本地控制台天然会被关机/休眠；当前 worker 重启后直接以“当前/今天上一档”派发，既不以持久 schedule 水位恢复，也没有明确的过窗结果。刚完成的 run-now truth 让单次手动结果诚实，这一刀补的是日用自动化在停机后的事实链。

Multica 的 Autopilot 是 `latest-only + 5 分钟迟到上限`：只取最新一个遗漏 slot，过迟就不触发，防止长停机回放或重启时任意迟到触发。它对过期 slot 返回空计划、**不落 execution 审计**；本仓落一条 `skipped` 是有价值的本地运营增强，而非机械复刻。

## 对照与差异

| 候选 | 当前缺口 / 已有能力 | Must | Out | 厚度 / 排序 |
| --- | --- | --- | --- | --- |
| **A. 休眠 catch-up + 过窗审计** | worker 每 30s 和启动即直接调用 `computeDuePlannedAt`；cron 取 `prev()`、daily 取今日时刻，未读取任何持久 schedule anchor。已有 `(rule_id, planned_at)` 唯一键、`schedule/skipped/error`、最近执行与连续跳过可复用。 | 新增纯 planner：从**最后一个 schedule run**（不是裸 `lastPlannedAt`）/创建时间到 `now` 枚举，锚点最多回看 24h、只返回最新 slot；≤5 分钟走现有 dispatch，>5 分钟只落一条幂等 `schedule + skipped + 明确“本机未运行，未补跑”`，并推进 schedule 水位。 | 不补跑每个遗漏 slot；不改 scheduler 周期、DB enum、重试/`pending_dispatch`、Pi；不把 stale `dispatching` 自动重发。 | **M / #1**：高频本地休眠场景的后端真相缺口。 |
| B. Settings 精确直达 automation 错误 | Ops snapshot 已给 `ruleId/runId/error`，但卡片只显示文本。已有通用“自动化失败规则”链接 `/automation?failed=1`，故这不是断链，只是少一次定位。 | 让“最近错误”链接到 `/automation?failed=1&rule=<id>&run=<id>`，Automation 展开/高亮该规则的该 run。 | 不增 API/DB；不改失败统计；不把 skipped 混入 failed。 | **S–M / #2**：低风险 UX 收尾，不能解决停机语义。 |

## A 的实现边界与风险

- `lastPlannedAt` 会被手动 `run-now` 的 `Date.now()` 更新，不能单独当 schedule anchor；应查最后一条 `source='schedule'` 的 run（或以后再引入 source-aware watermark）。否则手动执行会静默吞掉遗漏 schedule slot。
- 过窗审计须复用 canonical `plannedAt` 与唯一键，重复 tick/重启只会有一条 skipped，且不建 Issue/Run。要避免把较旧审计写回成较小水位。
- 保留已有超龄 `dispatching → failed` 收尸；planner 不可越过尚需处理的最新 schedule 占位/失败状态。这个交互是本刀的主要实现风险，先以固定时钟集成测试钉住。

## 验收路径

1. **后端固定时钟**：interval/cron/daily 各覆盖“5 分钟内只派发最新 slot”“超过窗口仅一条 skipped、无 Issue/linked Run”“第二次 tick/重启不重复”“下一新 slot 正常”；另测手动 run 不能改变 schedule anchor。
2. **隔离 Playwright**：预置规则和最后 schedule run 为 `now-6m`，启动 worker/tick 后访问 `/automation` → 展开“最近执行” → 见“已跳过 / 本机未运行，未补跑”，且无 Issue/Run 链接；随后点击“立即执行”仍走现有显式人工补救。
3. **B 若后做**：`/settings` 健康页的最近错误 → 精确 rule/run 展开 → 已有 linked Run 继续进入 `/runs?run=…`。

## 关键出处

- 本仓当前 latest-only 当前格计算：`app/packages/server/src/orchestration/automation-dispatch.ts:62-92`；worker 启动立即 tick：`app/packages/server/src/orchestration/automation-worker.ts:15-49`。
- 本仓幂等和可复用审计字段：`app/packages/server/src/db/schema.ts:591-623`；占位成功即更新水位：`app/packages/server/src/orchestration/automation-dispatch.ts:405-424`；手动 run 使用 `Date.now()`：`app/packages/server/src/routes/automation.ts:241-250`。
- 本仓已展示最近执行/原因与跳过告警：`app/packages/web/components/AutomationPage.tsx:90-165,1079-1105`。
- Settings 已有通用失败回跳而非精确回跳：`app/packages/web/components/SettingsPage.tsx:1402-1404,1663-1672`；Ops 已携带精确 ID：`app/packages/server/src/ops-snapshot.ts:277-289,496-537`。
- Multica catch-up 策略：`references/repos/multica/server/internal/scheduler/spec.go:23-38,118-129`；Autopilot anchor/latest-only/5m stale guard：`references/repos/multica/server/internal/scheduler/jobs_autopilot.go:33-38,220-315`；过期 hook 返回空、manager 不 claim：`references/repos/multica/server/internal/scheduler/manager.go:200-218`。

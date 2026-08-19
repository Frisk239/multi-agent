# Spec: automation-rule-archive-preserves-history

日期：2026-08-19
状态：实施中
上一刀 Intake：`app/.progress/automation-schedule-catchup-truth-intake.md`（通过）
调研：`app/.progress/automation-next-gap-discovery-2026-08-19.md`

## 用户路径

操作者在 `/automation` 对不再需要的规则点“归档”，确认框明确说明会停止后续计划但保留执行记录；动作完成后规则从日常列表消失。已存在的 failed/skipped/pending 记录、关联 Issue 和 Agent Run 不被 cascade 抹掉，且归档后不能再通过立即执行、编辑或“重新派发”产生新工作。

## 调研与决策

- Multica 的用户语义 delete 是 archive：停止未来触发、默认隐藏，但执行记录和任务继续可追溯：`references/repos/multica/server/internal/handler/autopilot.go:1055-1083`，持久记录保留的集成证据见 `autopilot_subscriber_test.go:600-711`。
- 本仓的 `DELETE /api/automation/rules/:id` 直接删除，`automation_run.rule_id` 是 `ON DELETE CASCADE`：`app/packages/server/src/routes/automation.ts:232-255`、`app/packages/server/src/db/schema.ts:565-623`。这会抹掉刚完成的 catch-up skipped 原因和 pending 的恢复链。
- 选定：新增 nullable `archivedAt`，保留 DELETE HTTP 动词但把领域语义改为原子归档（`archivedAt=now`、`enabled=0`）。不改变已有 FK；由软归档绕开 cascade。默认列表仅活跃规则，但按 id / runs 历史读取保持可用。

## Must

1. 完成最小 SQLite migration、Drizzle schema、shared `AutomationRule` / reshape 契约：规则有 `archivedAt`，新建规则为 null；现有库 migrate 后保留所有现存 rule/run。
2. `DELETE /api/automation/rules/:id` 改为幂等安全的归档写入：活跃 rule 设 `enabled=0` 与 `archivedAt=now`，不删 rule/run/Issue/AgentRun；默认 `GET /rules` 过滤 archived，`GET /rules/:id` 和 `GET /rules/:id/runs` 仍可读历史。
3. 归档后 `PATCH`、`POST run-now` 和 `POST automation-runs/:id/reconcile` 明确返回 `409`，不能生成新 Issue/Run；worker 只会取 enabled rule，既有已启动 Agent Run 不主动取消。
4. `/automation` 按钮和确认文案改为“归档”，明确“停止后续计划，保留执行记录”；成功后列表移除，并给出保留历史的确认 toast。不得再声称会删除执行记录。
5. shared/server/Web 回归、真实 SQLite/Fastify contract 覆盖 archive 后 evidence 存活和三个阻断动作；隔离 current-source Playwright 创建含 pending/failed 历史的 rule → 归档 → UI 消失 → API/DB 证明历史仍在且 run-now/reconcile 被拒绝。不得使用默认端口/数据库或启动 CLI。

## Out

- 不做永久清理、恢复/归档列表 UI、版本历史或批量归档。
- 不取消已启动 Agent Run，不更改已有 AgentRun、Issue、retry、catch-up 或 scheduler 状态机。
- 不做连续 skipped 的钻取 UI（后续 G3-15）。

## 验收

- 数据库/API：归档有 failed/skipped/pending 的 rule 后，rule 行及所有 `automation_run`、linked Issue/AgentRun 存活；活跃列表没有该 rule；历史 runs endpoint 可读；edit/run-now/reconcile 全部 409。
- 浏览器：确认框与 toast 的用词是“归档 / 停止后续计划 / 保留执行记录”；完成后不再出现在 Automation 表，且没有任何 CLI 或新 AgentRun。

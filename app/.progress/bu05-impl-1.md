# Handoff: bu05-impl-1

> 切片：`补5` / `bu05` · 角色：`impl` · 序号：`1`  
> 日期：2026-07-17  
> 分支：`feat/bu05-automation` · worktree：`.worktrees/bu05-automation`

## 上下文（给下一个会话读）

补5 最小自动化（schedule + run-now）。本棒只做 **plan Task 1–3**：schema/migration、dispatch+worker、REST API。  
**不做 Web UI**（impl-2：Task 4–5）。

真源：
- spec：`docs/superpowers/specs/2026-07-17-bu05-autopilot-design.md`
- plan：`docs/superpowers/plans/2026-07-17-bu05-automation.md`
- kickoff：`app/.progress/bu05-planner-0.md`

## 本会话完成了什么

### Task 1 — Shared + migration + schema
- `app/packages/shared/src/schema.ts`
  - `Issue.originType` 支持 `quick_create | automation`
  - `originRuleId`
  - `AutomationRule` / `Create/UpdateAutomationRuleInput` / `AutomationRun` 等
- `app/packages/server/src/db/schema.ts`
  - `automation_rule` / `automation_run`（UNIQUE `(rule_id, planned_at)`）
  - `issue.origin_rule_id`
- 手写 `drizzle/0010_bu05_automation.sql` + journal idx 10
- `reshape.ts`：`toIssue` origin 扩展；`toAutomationRule` / `toAutomationRun`

### Task 2 — createIssueCore + dispatch + worker
- 新 `orchestration/issue-create.ts`：`createIssueCore`（identifier/position、origin、inbox、enqueue）
- 新 `orchestration/automation-dispatch.ts`
  - `renderTemplate`：`{{date}}` / `{{time}}` / `{{iso_time}}` / `{{rule_name}}`
  - `computeDuePlannedAt`：interval grid / daily_at 本地 HH:mm；latest_only
  - `dispatchAutomationRule`：幂等 SELECT+INSERT；非法 assignee → failed 不建卡；成功建 Issue + enqueue + last_planned_at
- 新 `orchestration/automation-worker.ts`：`startAutomationWorker` 30s tick，仅 `enabled=1`
- `index.ts` 注册 worker
- `routes/issues.ts` POST 改为调 `createIssueCore`（PUT 保持原逻辑）

### Task 3 — REST
- 新 `routes/automation.ts` + `app.ts` 注册：
  - GET/POST `/api/automation/rules`
  - GET/PATCH/DELETE `/api/automation/rules/:id`
  - POST `/api/automation/rules/:id/run-now`（disabled 也可；201 + run，failed 也 201）
  - GET `/api/automation/rules/:id/runs?limit=`

## 自测结果

```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

```
$ cd app/packages/server && rm -f dev.db* && pnpm db:migrate && pnpm db:seed
✓ 迁移完成
✓ seed 完成：8 条 issue，6 条 comment
```

```
PORT=3015 server 起 →
GET /api/issues 200
GET /api/wiki/pages 200
GET /api/memory 200
GET /api/inbox 200
GET /api/settings/status 200

POST /api/automation/rules → 201
POST .../run-now → 201 success + issueId #1
POST .../run-now → 201 success + issueId #2（不同 planned_at / 两张卡）
非法 assignee agt-nope → 201 failed, issueId=null, error 含「agent 不存在」
PATCH enabled=false → run-now 仍 201 success
GET .../runs → ≥3 条 manual success
GET /api/issues → originType=automation 卡 ≥3（含 disabled 后第三次）
```

## 与计划的偏离

1. **UpdateAutomationRuleInput**：plan 写 `CreateAutomationRuleInput.partial()`，但 Create 是 `ZodEffects`，TS 无 `.partial`。改为 `CreateAutomationRuleFields.partial()` + 轻量 superRefine；完整 schedule 校验在 PATCH 与 prev 合并后做。
2. **issues POST** 抽了 `createIssueCore`；PUT 未动，避免回归风险。
3. **smoke 用 Python urllib** 而非 curl：Git Bash 下 curl+JSON 触发 Fastify Content-Length 不匹配；实现本身无问题。

## 遗留 / 下一个执行者（impl-2）要注意的点

- 分支已有 API；Web 只需 hooks + `/automation` + 侧栏/CmdK。
- Shared 类型已导出：`AutomationRule`、`CreateAutomationRuleInput`、`UpdateAutomationRuleInput`、`AutomationRun`。
- run-now 返回 **AutomationRun 本体**（201），`status` 可能为 `failed`；UI toast 看 `status`/`error`/`issueId`。
- disabled 规则 schedule tick 跳过，手动 run-now 仍可。
- 模板占位符大小写敏感；body 自动追加「由自动化规则…」footer。
- **勿 commit** `wiki/`、`*.db`。
- migration 已是 `0010_bu05_automation`；不要再 generate 重号。
- seed agent：`agt-lead` 可用于 demo。

## 验收结论（仅计划者填）

- [ ] 0010 + unique
- [ ] run-now 建卡；二次 run-now 第二张卡
- [ ] tick 注册；非法 assignee failed
- [ ] typecheck + smoke
- 结论：

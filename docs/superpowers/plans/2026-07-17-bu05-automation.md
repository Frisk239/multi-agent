# 补5 — 最小自动化（schedule + run-now）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans；本项目惯例 **计划者只验收 + 执行者 impl-1 → impl-2 串行**。  
> **spec（已批准）：** [`docs/superpowers/specs/2026-07-17-bu05-autopilot-design.md`](../specs/2026-07-17-bu05-autopilot-design.md)

**Goal:** 自动化规则按 interval/daily 或「立即执行」创建 Issue 并指派，幂等不重复；`/automation` 可管理。

**Architecture:** 表 `automation_rule` + `automation_run`（UNIQUE rule_id+planned_at）；`dispatchAutomationRule` 内部建 Issue（抽 `createIssueCore` 或复制 issues 路由逻辑）+ 现网 enqueue；`setInterval(30s)` tick 对 enabled 规则算 due plan（latest_only）；run-now 走同一 dispatch。无 webhook、无 crontab 库。

**Tech Stack:** 现有 Fastify monorepo、Drizzle SQLite、Zod、Next；手写 migration **0010**。

## Global Constraints

- **分支：** `feat/bu05-automation` from **origin/main**（含补1–4）  
- **migration：** `0010_bu05_automation.sql` + journal idx 10  
- **B + 方案 1：** schedule = `interval_minutes`∈{5,15,30,60} | `daily_at` `HH:mm` 本地时区  
- **幂等：** UNIQUE(rule_id, planned_at)；冲突 → skip 静默  
- **catch-up：** 只尝试当前 due 点，不回放历史  
- **M6：** disabled 仍可 run-now  
- **M4：** 无 runtime 仍建卡  
- **不 push main**；不 commit wiki/*.db  
- **回归：** typecheck；issues/wiki/memory/inbox/settings 200  
- Conventional Commits：`feat(bu05):` / `docs(bu05):`  
- 计划者只验收  

---

## File Structure

```
app/packages/shared/src/schema.ts
  AutomationRule, AutomationRun, Create/Update inputs

app/packages/server/src/db/schema.ts
  automationRules, automationRuns
  issues.originRuleId + originType 含 automation

app/packages/server/drizzle/0010_bu05_automation.sql
app/packages/server/drizzle/meta/_journal.json

app/packages/server/src/orchestration/issue-create.ts  [新，推荐]
  createIssueCore(...) 供 issues 路由与 automation 共用

app/packages/server/src/orchestration/automation-dispatch.ts  [新]
  renderTemplate, nextPlan, dispatchAutomationRule

app/packages/server/src/orchestration/automation-worker.ts  [新]
  startAutomationWorker 30s tick

app/packages/server/src/routes/automation.ts  [新]
app/packages/server/src/app.ts
app/packages/server/src/index.ts
app/packages/server/src/routes/issues.ts  [可选 refactor 调 core]

app/packages/web/lib/api.ts
app/packages/web/components/AutomationPage.tsx
app/packages/web/app/automation/page.tsx
app/packages/web/components/Sidebar.tsx
app/packages/web/components/CommandPalette.tsx
app/packages/web/app/globals.css
```

---

### Task 1: Shared + migration + schema

**Files:**
- Modify: `app/packages/shared/src/schema.ts`
- Modify: `app/packages/server/src/db/schema.ts`
- Create: `app/packages/server/drizzle/0010_bu05_automation.sql`
- Modify: `app/packages/server/drizzle/meta/_journal.json`
- Modify: `app/packages/server/src/db/reshape.ts`（Issue origin 字段）

**Shared（写入 schema.ts）：**

```ts
export const AutomationScheduleKind = z.enum(['interval_minutes', 'daily_at']);
export const AutomationRunSource = z.enum(['schedule', 'manual']);
export const AutomationRunStatus = z.enum(['success', 'failed', 'skipped']);

export const AutomationRule = z.object({
  id: BusinessId,
  name: z.string(),
  enabled: z.boolean(),
  scheduleKind: AutomationScheduleKind,
  intervalMinutes: z.number().int().nullable(),
  dailyTime: z.string().nullable(), // "HH:mm"
  assigneeType: z.enum(['agent', 'squad']),
  assigneeId: BusinessId,
  titleTemplate: z.string(),
  bodyTemplate: z.string(),
  lastPlannedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AutomationRule = z.infer<typeof AutomationRule>;

export const CreateAutomationRuleInput = z
  .object({
    name: z.string().min(1).max(80),
    enabled: z.boolean().optional().default(true),
    scheduleKind: AutomationScheduleKind,
    intervalMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]).optional().nullable(),
    dailyTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    assigneeType: z.enum(['agent', 'squad']),
    assigneeId: BusinessId,
    titleTemplate: z.string().min(1).max(200),
    bodyTemplate: z.string().max(10000).optional().default(''),
  })
  .superRefine((v, ctx) => {
    if (v.scheduleKind === 'interval_minutes') {
      if (v.intervalMinutes == null) {
        ctx.addIssue({ code: 'custom', message: 'interval_minutes required', path: ['intervalMinutes'] });
      }
    } else if (!v.dailyTime) {
      ctx.addIssue({ code: 'custom', message: 'dailyTime required', path: ['dailyTime'] });
    }
  });
export type CreateAutomationRuleInput = z.infer<typeof CreateAutomationRuleInput>;

export const UpdateAutomationRuleInput = CreateAutomationRuleInput.partial().refine(
  (o) => Object.keys(o).length > 0,
  { message: 'empty patch' },
);
export type UpdateAutomationRuleInput = z.infer<typeof UpdateAutomationRuleInput>;

export const AutomationRun = z.object({
  id: BusinessId,
  ruleId: BusinessId,
  plannedAt: z.string().datetime(),
  source: AutomationRunSource,
  status: AutomationRunStatus,
  issueId: BusinessId.nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AutomationRun = z.infer<typeof AutomationRun>;
```

**Issue 扩展：** `originType` 含 `'automation'`；`originRuleId: z.string().nullable().optional()`。

**DB tables**（drizzle + SQL）：

```sql
CREATE TABLE `automation_rule` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `schedule_kind` text NOT NULL,
  `interval_minutes` integer,
  `daily_time` text,
  `assignee_type` text NOT NULL,
  `assignee_id` text NOT NULL,
  `title_template` text NOT NULL,
  `body_template` text DEFAULT '' NOT NULL,
  `last_planned_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_run` (
  `id` text PRIMARY KEY NOT NULL,
  `rule_id` text NOT NULL,
  `planned_at` integer NOT NULL,
  `source` text NOT NULL,
  `status` text NOT NULL,
  `issue_id` text,
  `error` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`rule_id`) REFERENCES `automation_rule`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_automation_run_rule_planned` ON `automation_run` (`rule_id`,`planned_at`);
--> statement-breakpoint
CREATE INDEX `idx_automation_run_rule_created` ON `automation_run` (`rule_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `issue` ADD `origin_rule_id` text;
```

（`origin_type` 已是 text，存 `automation` 即可，无需改 CHECK。）

- [ ] **Step 1: shared + drizzle + migration + journal**  
- [ ] **Step 2: reshape Issue originRuleId / originType**  
- [ ] **Step 3:** `pnpm -r typecheck` + migrate  
- [ ] **Step 4: Commit** `feat(bu05): automation_rule/run schema + origin_rule_id`

---

### Task 2: createIssueCore + dispatch + worker

**Files:**
- Create: `app/packages/server/src/orchestration/issue-create.ts`（推荐）
- Create: `app/packages/server/src/orchestration/automation-dispatch.ts`
- Create: `app/packages/server/src/orchestration/automation-worker.ts`
- Modify: `app/packages/server/src/index.ts`
- Modify: `app/packages/server/src/routes/issues.ts`（可选改为调 core；若时间紧可在 dispatch 内复制 create 逻辑，handoff 注明）

**`renderTemplate(tpl, ctx)`：**

```ts
export function renderTemplate(
  tpl: string,
  ctx: { plannedAt: number; ruleName: string },
): string {
  const d = new Date(ctx.plannedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return tpl
    .replaceAll('{{iso_time}}', d.toISOString())
    .replaceAll('{{date}}', date)
    .replaceAll('{{time}}', time)
    .replaceAll('{{rule_name}}', ctx.ruleName);
}
```

**`computeDuePlannedAt(rule, now): number | null`：**

```ts
// interval: grid = intervalMinutes * 60_000
//   planned = Math.floor(now / grid) * grid
//   return planned if now >= planned (always true for current grid); caller checks not yet run
// daily_at: parse HH:mm local → today's ms; if now >= that and not run, return that; else null
```

**`dispatchAutomationRule(ruleId, plannedAt, source)`：**

```ts
// 1. load rule
// 2. SELECT existing run by (ruleId, plannedAt) → if exists return it (skip)
// 3. validate assignee (agent exists; squad has leader)
//    if fail: INSERT run failed + error; return
// 4. title = renderTemplate(rule.titleTemplate)
//    body = renderTemplate(rule.bodyTemplate) + footer 来源
// 5. createIssueCore({
//      title, description: body, priority: 'medium',
//      assignee: { type, id },
//      originType: 'automation', originRuleId: rule.id,
//      creator: LOCAL_MEMBER
//    })  // 内含 identifier 生成、eventBus issue:created、enqueue
// 6. INSERT automation_run success + issueId
// 7. UPDATE rule.last_planned_at = plannedAt
// 8. return run
// On unique race: catch + SELECT return
```

**Worker：**

```ts
export function startAutomationWorker(): void {
  if (timer) return;
  const tick = () => {
    try {
      const now = Date.now();
      const rules = db.select().from(automationRules).where(eq(automationRules.enabled, 1)).all();
      for (const r of rules) {
        const due = computeDuePlannedAt(r, now);
        if (due == null) continue;
        dispatchAutomationRule(r.id, due, 'schedule');
      }
    } catch (e) {
      console.error('[automation] tick failed', e);
    }
  };
  tick();
  timer = setInterval(tick, 30_000);
}
```

`index.ts`：`startAutomationWorker()` 在 run-worker 旁。

- [ ] **Step 1: issue-create core（或内联）**  
- [ ] **Step 2: dispatch + template + due**  
- [ ] **Step 3: worker + index**  
- [ ] **Step 4: unit-ish smoke via tsx 调 dispatch**（可选）  
- [ ] **Step 5: Commit** `feat(bu05): automation dispatch and tick worker`

---

### Task 3: REST API

**Files:**
- Create: `app/packages/server/src/routes/automation.ts`
- Modify: `app/packages/server/src/app.ts`
- Create reshape helpers `toAutomationRule` / `toAutomationRun`

**Routes：**

| Method | Path |
|---|---|
| GET | `/api/automation/rules` |
| POST | `/api/automation/rules` |
| GET | `/api/automation/rules/:id` |
| PATCH | `/api/automation/rules/:id` |
| DELETE | `/api/automation/rules/:id` |
| POST | `/api/automation/rules/:id/run-now` |
| GET | `/api/automation/rules/:id/runs?limit=` |

**run-now：**

```ts
const plannedAt = Date.now(); // ms unique enough
const run = dispatchAutomationRule(id, plannedAt, 'manual');
return reply.status(201).send(run);
// run.status may be failed — still 201
```

**POST create：** Zod CreateAutomationRuleInput；默认 enabled true。

- [ ] **Step 1: routes + register**  
- [ ] **Step 2: API smoke**

```bash
curl -s -X POST localhost:P/api/automation/rules -H 'content-type: application/json' -d '{
  "name":"巡检",
  "scheduleKind":"interval_minutes",
  "intervalMinutes":5,
  "assigneeType":"agent",
  "assigneeId":"agt-lead",
  "titleTemplate":"巡检 {{date}} {{time}}",
  "bodyTemplate":"自动创建"
}'
curl -s -X POST localhost:P/api/automation/rules/RID/run-now
# expect issue_id set; GET /api/issues 见新卡
curl -s -X POST localhost:P/api/automation/rules/RID/run-now
# second issue different planned_at
```

- [ ] **Step 3: typecheck + commit** `feat(bu05): automation REST API and run-now`

---

### Task 4: Web `/automation`

**Files:**
- Modify: `app/packages/web/lib/api.ts` — hooks  
- Create: `app/packages/web/components/AutomationPage.tsx`  
- Create: `app/packages/web/app/automation/page.tsx`  
- Modify: Sidebar + CommandPalette  
- CSS 适量  

**Hooks：** `useAutomationRules`、`useCreateAutomationRule`、`useUpdateAutomationRule`、`useDeleteAutomationRule`、`useRunAutomationNow`、`useAutomationRuns(ruleId)`  

**UI Must：**

- 列表 + enabled 开关（PATCH）  
- 新建表单：name、scheduleKind、interval 或 dailyTime、assignee、templates  
- **立即执行** 按钮 + toast（success 含 issue 或 failed error）  
- 空态  
- 可选：展开最近 runs  

**导航：** 侧栏「自动化」`icon: 'automation'` href `/automation`；CmdK 同。

- [ ] **Step 1: api hooks**  
- [ ] **Step 2: page + nav**  
- [ ] **Step 3: typecheck**  
- [ ] **Step 4: Commit** `feat(bu05): automation UI page and nav`

---

### Task 5: 回归 + handoff

**验收勾选（写入 handoff）：**

- [ ] run-now → Issue + run success + 可 enqueue  
- [ ] 两次 run-now → 两张卡  
- [ ] 非法 assignee → failed run  
- [ ] disabled：tick 不跑；run-now 仍可  
- [ ] typecheck；issues/wiki/memory/inbox/settings 200  
- [ ] 无 wiki/db 误提交  

```bash
cd app && pnpm -r typecheck
git push -u origin feat/bu05-automation
```

Handoff：`bu05-impl-1.md`（Task 1–3）、`bu05-impl-2.md`（Task 4–5）。

---

## 执行者拆分

| 棒 | Tasks |
|---|---|
| **impl-1** | 1–3 schema + dispatch + worker + API |
| **impl-2** | 4–5 UI + 回归 |

串行。

---

## Self-Review

| Spec | Task |
|---|---|
| B run-now + schedule | 2–4 |
| 方案 1 interval/daily | 1 + computeDue |
| 幂等 unique | 1 + dispatch |
| create_issue + enqueue | 2 |
| 无 webhook | 全程 |
| UI /automation | 4 |
| origin automation | 1–2 |

---

## 明确不做

Webhook、crontab 库、run_only、every_plan 回放、e2e 套件。

---

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-07-17-bu05-automation.md`.**

Kickoff：`app/.progress/bu05-planner-0.md`。计划者只验收；人派执行者。

# 补2 — Agent / Squad 可运营（厚切片）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans；本项目惯例为 **计划者只验收 + 执行者 impl-1 → impl-2 串行**。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户不改 seed/SQL，即可在产品内 **创建/编辑/删除 Agent 与 Squad**，配置 instructions / protocol / members，看到 **readiness** 与 **最近 Runs**，并完成一次指派执行闭环。

**Architecture:**  
扩展现有 `agent` / `squad` / `squad_member` 表（加 `instructions`），在 `roster` 路由补齐 REST CRUD；`readiness` 复用 `RuntimeBackend.detect()` + 当前 running 计数；Agent 详情四 Tab **全部可用**（概览可编辑 / Runs 列表 / Skills / MCP 已有 + Instructions 可写）；Squad 从只读升级为可编辑表单。`buildPrompt` 在 skill/wiki/memory 之后、issue body 之前注入 agent `instructions`（非 leader briefing 替代）。不引入 Redis、不自造 agent loop、不建 squad_task 表。

**Tech Stack:** 现有 monorepo — Fastify、Drizzle SQLite、Zod shared、Next.js + React Query、toast；手写 migration `0008`。

## Global Constraints

- **分支：** `feat/bu02-roster-ops` from **origin/main**（须已含补1 / PR #12）  
- **编号：** 补2 / bu02；handoff：`app/.progress/bu02-impl-1.md`、`bu02-impl-2.md`  
- **厚切片：** 2 名执行者，每棒工作量大；**串行**（impl-2 依赖 impl-1 契约与 API）  
- **不 push main**；合入走 PR  
- **不 commit** `wiki/`、`*.db`；不落 e2e 目录  
- **回归门禁：** `pnpm -r typecheck`；`GET /api/issues`、`/api/wiki/pages`、`/api/memory/status`、`/api/inbox` 200  
- **删除策略：** 硬删允许；若存在 `agent_run.status IN ('queued','running')` 或仍是某 squad 的 `leader_id` → **409** 拒绝；删 agent 时 cascade `agent_skill` / `squad_member`（FK 已有 cascade 则依赖 DB）  
- **ID：** 新建默认 `crypto.randomUUID()`；允许可选客户端 `id` 仅当 `^[a-z][a-z0-9_-]{1,63}$`（方便 seed 风格），否则 UUID  
- **计划者：** 只计划/验收；实现另派会话  
- Conventional Commits：`feat(bu02):` / `docs(bu02):`

---

## File Structure

```
app/packages/shared/src/schema.ts
  - AgentDetail + instructions
  - CreateAgentInput / UpdateAgentInput
  - CreateSquadInput / UpdateSquadInput
  - AgentReadiness
  - AgentSummary 可选带 category（列表展示）

app/packages/server/src/db/schema.ts
  - agents.instructions text default ''

app/packages/server/drizzle/0008_bu02_agent_instructions.sql
app/packages/server/drizzle/meta/_journal.json

app/packages/server/src/db/reshape.ts 或 roster helpers
  - toAgentDetail / toAgentSummary

app/packages/server/src/routes/roster.ts
  - POST/PATCH/DELETE agents
  - POST/PATCH/DELETE squads
  - PUT members
  - GET readiness
  - GET agents/:id/runs

app/packages/server/src/runtime/prompt.ts
  - 注入 agent instructions 块

app/packages/server/src/orchestration/readiness.ts  [新，可选内联 roster]
  - computeAgentReadiness(agentId)

app/packages/web/lib/api.ts
  - mutations + useAgentRuns + useAgentReadiness

app/packages/web/components/AgentsPage.tsx
  - 新建按钮 + 表单

app/packages/web/components/AgentDetailPage.tsx
  - 概览编辑；Instructions 真表单；Runs Tab；readiness chip

app/packages/web/components/SquadsPage.tsx / SquadDetailPage.tsx
  - 新建 + 编辑 protocol/directive/leader/members

app/packages/web/components/AgentForm.tsx / SquadForm.tsx  [可新建组件减重]
```

---

### Task 1: Shared 契约 + migration + reshape

**Files:**
- Modify: `app/packages/shared/src/schema.ts`
- Modify: `app/packages/server/src/db/schema.ts`
- Create: `app/packages/server/drizzle/0008_bu02_agent_instructions.sql`
- Modify: `app/packages/server/drizzle/meta/_journal.json`
- Modify: `app/packages/server/src/db/reshape.ts`（或 roster 内本地 map；优先 reshape 统一）

**Interfaces — Produces:**

```ts
// AgentDetail 增加
instructions: z.string(), // 默认 ""

export const CreateAgentInput = z.object({
  name: z.string().min(1).max(80),
  runtime: RuntimeId,
  category: z.string().max(80).optional().nullable(),
  concurrency: z.number().int().min(1).max(8).optional().default(1),
  instructions: z.string().max(20000).optional().default(''),
  mcpServers: z.string().nullable().optional(), // JSON 字符串或 null
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/).optional(),
});
export type CreateAgentInput = z.infer<typeof CreateAgentInput>;

export const UpdateAgentInput = z
  .object({
    name: z.string().min(1).max(80).optional(),
    runtime: RuntimeId.optional(),
    category: z.string().max(80).nullable().optional(),
    concurrency: z.number().int().min(1).max(8).optional(),
    instructions: z.string().max(20000).optional(),
    mcpServers: z.string().nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'empty patch' });
export type UpdateAgentInput = z.infer<typeof UpdateAgentInput>;

export const CreateSquadInput = z.object({
  name: z.string().min(1).max(80),
  leaderId: BusinessId,
  operatingProtocol: z.string().max(50000).optional().default(''),
  missionDirective: z.string().max(50000).optional().default(''),
  memberIds: z.array(BusinessId).default([]), // 不含 leader 也可；服务端会确保 leader 在 roster 语义
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/).optional(),
});
export type CreateSquadInput = z.infer<typeof CreateSquadInput>;

export const UpdateSquadInput = z
  .object({
    name: z.string().min(1).max(80).optional(),
    leaderId: BusinessId.optional(),
    operatingProtocol: z.string().max(50000).optional(),
    missionDirective: z.string().max(50000).optional(),
    memberIds: z.array(BusinessId).optional(), // 若提供则整表替换 squad_member
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'empty patch' });
export type UpdateSquadInput = z.infer<typeof UpdateSquadInput>;

export const AgentReadiness = z.object({
  agentId: BusinessId,
  runtime: RuntimeId,
  runtimeInstalled: z.boolean(),
  runtimePath: z.string().nullable(),
  runtimeVersion: z.string().nullable(),
  concurrency: z.number().int(),
  runningCount: z.number().int(),
  slotsAvailable: z.number().int(),
  cwdConfigured: z.boolean(),
  status: z.enum(['ready', 'busy', 'runtime_missing', 'cwd_missing', 'error']),
  detail: z.string().nullable(),
});
export type AgentReadiness = z.infer<typeof AgentReadiness>;
```

`SquadDetail.leaderId`：今日 `loadSquadDetail` 在 `!leaderId` 时返回 null — CRUD 后 **强制 leader 非空**；schema 保持 `BusinessId`。

- [ ] **Step 1: 写 shared 类型**（上文整段合入 `schema.ts`，并从 `index.ts` 已有 re-export 确认导出）

- [ ] **Step 2: DB `agents.instructions`**

```ts
instructions: text('instructions').notNull().default(''),
```

Migration `0008_bu02_agent_instructions.sql`:

```sql
ALTER TABLE `agent` ADD `instructions` text DEFAULT '' NOT NULL;
```

Journal idx 8，`tag`: `0008_bu02_agent_instructions`。

- [ ] **Step 3: GET agent 映射带上 instructions**

改 `roster.ts` GET `:id` 与任何 `toAgentDetail`：

```ts
instructions: row.instructions ?? '',
```

- [ ] **Step 4: migrate + typecheck**

```bash
cd app/packages/server && pnpm exec tsx src/db/migrate.ts
cd app && pnpm --filter @ma/shared typecheck && pnpm --filter @ma/server typecheck
```

Expected: `✓ 迁移完成`；typecheck 绿（web 可能暂未用新类型仍绿）。

- [ ] **Step 5: Commit**

```bash
git add app/packages/shared app/packages/server/src/db app/packages/server/drizzle app/packages/server/src/routes/roster.ts
git commit -m "feat(bu02): agent.instructions schema + shared CRUD contracts"
```

---

### Task 2: Agent CRUD + readiness + runs list + prompt inject

**Files:**
- Modify: `app/packages/server/src/routes/roster.ts`
- Create: `app/packages/server/src/orchestration/readiness.ts`（推荐）
- Modify: `app/packages/server/src/runtime/prompt.ts`
- Modify: `app/packages/server/src/db/client.ts` 若 assignee label 依赖 agents 表（已有则确认新建 agent 可解析 label）

**Interfaces — Produces:**

| Method | Path | Body / 行为 |
|---|---|---|
| POST | `/api/agents` | CreateAgentInput → 201 AgentDetail |
| PATCH | `/api/agents/:id` | UpdateAgentInput → AgentDetail |
| DELETE | `/api/agents/:id` | 204 或 `{ ok: true }`；冲突 409 |
| GET | `/api/agents/:id/readiness` | AgentReadiness |
| GET | `/api/agents/:id/runs?limit=20` | AgentRun[] 新→旧 |

- [ ] **Step 1: `computeAgentReadiness`**

```ts
// readiness.ts
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agents, agentRuns } from '../db/schema.js';
import { getBackend } from '../runtime/registry.js';
import type { AgentReadiness } from '@ma/shared';

export async function computeAgentReadiness(agentId: string): Promise<AgentReadiness | null> {
  const row = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!row) return null;
  const backend = getBackend(row.runtime);
  const det = await backend.detect();
  const runningCount =
    db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(agentRuns)
      .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.status, 'running')))
      .get()?.cnt ?? 0;
  const cwdConfigured = Boolean(process.env.MA_WORKSPACE_CWD);
  const slotsAvailable = Math.max(0, row.concurrency - runningCount);

  let status: AgentReadiness['status'] = 'ready';
  let detail: string | null = null;
  if (!cwdConfigured) {
    status = 'cwd_missing';
    detail = '未配置 MA_WORKSPACE_CWD';
  } else if (!det.installed) {
    status = 'runtime_missing';
    detail = `runtime ${row.runtime} 未安装或不在 PATH`;
  } else if (runningCount >= row.concurrency) {
    status = 'busy';
    detail = `运行中 ${runningCount}/${row.concurrency}`;
  }

  return {
    agentId: row.id,
    runtime: row.runtime,
    runtimeInstalled: det.installed,
    runtimePath: det.path,
    runtimeVersion: det.version,
    concurrency: row.concurrency,
    runningCount,
    slotsAvailable,
    cwdConfigured,
    status,
    detail,
  };
}
```

- [ ] **Step 2: POST /api/agents**

校验 CreateAgentInput；id 冲突 → 409；insert；返回完整 AgentDetail（与 GET 同形）。

- [ ] **Step 3: PATCH /api/agents/:id**

404 if missing；只更新提供的字段；返回 AgentDetail。

- [ ] **Step 4: DELETE /api/agents/:id**

```ts
// 活跃 run
const active = db.select().from(agentRuns).where(and(eq(agentRuns.agentId, id), inArray(agentRuns.status, ['queued','running']))).get();
if (active) return 409 { error: 'agent 仍有未完成 run' };
// 是否 leader
const lead = db.select().from(squads).where(eq(squads.leaderId, id)).get();
if (lead) return 409 { error: `仍是小队 ${lead.name} 的 leader` };
// delete agent（cascade skills/members）
```

- [ ] **Step 5: GET readiness + GET runs**

```ts
app.get('/api/agents/:id/readiness', async (req, reply) => {
  const r = await computeAgentReadiness(id);
  if (!r) return reply.status(404).send({ error: 'agent 不存在' });
  return r;
});

app.get('/api/agents/:id/runs', async (req, reply) => {
  // limit default 20 max 100
  // orderBy desc createdAt
  // map toAgentRun
});
```

- [ ] **Step 6: prompt 注入 instructions**

在 `buildPrompt`，当 `run?.agentId` 存在时读 `agents.instructions`，非空则：

```ts
parts.push(`# Agent Instructions\n${agent.instructions}`);
```

**顺序（锁定）：** skill → wiki → memory → **agent instructions** → briefing(if leader) → issue body  
（在现有 memory 之后、briefing 之前插入。）

- [ ] **Step 7: API smoke**

```bash
# server PORT=3020
curl -s -X POST localhost:3020/api/agents -H 'content-type: application/json' \
  -d '{"name":"Bu02 Tester","runtime":"claude-code","concurrency":1,"instructions":"Always reply short."}'
curl -s localhost:3020/api/agents/ID/readiness
curl -s localhost:3020/api/agents/ID/runs
curl -s -X PATCH localhost:3020/api/agents/ID -H 'content-type: application/json' -d '{"name":"Bu02 Renamed"}'
```

Expected: 201 含 instructions；readiness 有 status 字段；PATCH 改名成功。

- [ ] **Step 8: typecheck + commit**

```bash
cd app && pnpm -r typecheck
git commit -m "feat(bu02): agent CRUD, readiness, runs list, prompt instructions"
```

---

### Task 3: Squad CRUD + members replace

**Files:**
- Modify: `app/packages/server/src/routes/roster.ts`
- Modify: `app/packages/server/src/db/squad-loader.ts`（若 leader 可空历史行：GET 已 404；创建时强制 leader）

**Interfaces:**

| Method | Path | 行为 |
|---|---|---|
| POST | `/api/squads` | CreateSquadInput → 201 SquadDetail |
| PATCH | `/api/squads/:id` | UpdateSquadInput → SquadDetail |
| DELETE | `/api/squads/:id` | 若有 issue `assignee_type=squad` 且 status 非终态 → 409；else 删 members + squad |
| （members） | 含在 POST/PATCH 的 `memberIds` | 事务：delete all members → insert；**leader 必须存在于 agents**；memberIds 中的 id 必须皆为 agent |

**成员语义（锁定）：**

- `squad_member` 存 **可被 @mention 的 peers**；leader 在 `squad.leader_id`。  
- 若 `memberIds` 含 leaderId，允许（幂等）；briefing 仍会 filter 掉 leader（现有 prompt 逻辑）。  
- 若 `memberIds` 为空，仅 leader 小队合法（solo squad）。

- [ ] **Step 1: 校验 helper**

```ts
function assertAgentExists(id: string): boolean {
  return !!db.select().from(agents).where(eq(agents.id, id)).get();
}

function replaceSquadMembers(squadId: string, memberIds: string[]): void {
  db.delete(squadMembers).where(eq(squadMembers.squadId, squadId)).run();
  const now = Date.now(); // 若表无 createdAt 则不需要
  for (const agentId of new Set(memberIds)) {
    if (!assertAgentExists(agentId)) throw new Error(`member not found: ${agentId}`);
    db.insert(squadMembers).values({ squadId, agentId }).run();
  }
}
```

- [ ] **Step 2: POST /api/squads**

- leader 必须存在  
- insert squad  
- replaceSquadMembers  
- return loadSquadDetail（必非 null）

- [ ] **Step 3: PATCH /api/squads/:id**

- 若改 leader：新 leader 必须存在  
- 若提供 memberIds：replace  
- return loadSquadDetail

- [ ] **Step 4: DELETE /api/squads/:id**

```ts
const busy = db.select().from(issues).where(
  and(eq(issues.assigneeType, 'squad'), eq(issues.assigneeId, id),
      inArray(issues.status, ['backlog','todo','in_progress','in_review','blocked']))
).get();
if (busy) return 409;
// delete members + squad
```

- [ ] **Step 5: 列表增强（可选但本厚切片要做）**

`GET /api/squads` 返回：

```ts
{ id, name, leaderId, memberCount }
```

shared 可扩 `SquadSummary`：

```ts
leaderId: BusinessId.optional(), // 或必填
memberCount: z.number().int().optional(),
```

- [ ] **Step 6: smoke**

```bash
curl -s -X POST localhost:3020/api/squads -H 'content-type: application/json' \
  -d '{"name":"补2小队","leaderId":"AGENT_ID","operatingProtocol":"用 @mention 委派","missionDirective":"完成最小闭环","memberIds":["AGENT_ID2"]}'
curl -s localhost:3020/api/squads/SID
curl -s -X PATCH ... -d '{"missionDirective":"更新指令"}'
```

- [ ] **Step 7: typecheck + commit**

```bash
git commit -m "feat(bu02): squad CRUD and member replace"
```

---

### Task 4: Web — Agents 运营 UI（厚）

**Files:**
- Modify: `app/packages/web/lib/api.ts`
- Modify: `app/packages/web/components/AgentsPage.tsx`
- Modify: `app/packages/web/components/AgentDetailPage.tsx`
- Create: `app/packages/web/components/AgentCreateForm.tsx`（可选）
- Modify: `app/packages/web/app/globals.css`（表单样式复用 existing btn/input）

**Hooks 必须实现：**

```ts
useCreateAgent / useUpdateAgent / useDeleteAgent
useAgentReadiness(id)
useAgentRuns(id)
```

全部 toast onError；create 成功 toast + invalidate 到 `/agents/:id` 或 invalidate 列表。

- [ ] **Step 1: api mutations**

对齐 REST；`useAgent` queryKey `['agent', id]`；mutation 成功 invalidate `['agents']`、`['agent', id]`、`['agent-readiness', id]`。

- [ ] **Step 2: AgentsPage**

- 页头「新建智能体」展开表单：name、runtime select（claude-code/opencode/cursor）、concurrency、instructions textarea  
- 表格列增加 **readiness 摘要**（可选：列表不拉 N 次 readiness 以免炸；**列表可只显示 runtime**，readiness 放详情——厚切片推荐详情必有、列表显示 category）  
- 行点击进详情；可有删除（confirm）

- [ ] **Step 3: AgentDetailPage 改造**

Tab 锁定为：

```ts
type TabId = 'overview' | 'runs' | 'skills' | 'mcp' | 'instructions';
// 或保持 4 个：把 overview 并进左侧 profile 可编辑
```

**最小可验收 Tab 集（必须）：**

1. **左侧 profile 可编辑**：name、category、runtime、concurrency + 保存 PATCH；**readiness chip**（颜色：ready 绿 / busy 黄 / missing 红）  
2. **Runs Tab**：`useAgentRuns` 列表 status/issueId 链到 issue、error 截断  
3. **Skills / MCP**：保持 S05  
4. **Instructions Tab**：textarea + 保存，**禁止 PlaceholderTab**

删除按钮：confirm → DELETE → router.push('/agents')。

- [ ] **Step 4: typecheck**

```bash
cd app && pnpm --filter @ma/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(bu02): agents CRUD UI, readiness, runs and instructions tabs"
```

---

### Task 5: Web — Squads 运营 UI（厚）

**Files:**
- Modify: `app/packages/web/lib/api.ts` — useCreateSquad / useUpdateSquad / useDeleteSquad  
- Modify: `app/packages/web/components/SquadsPage.tsx`  
- Modify: `app/packages/web/components/SquadDetailPage.tsx`  
- 复用 `useAgents()` 做 leader/member 多选

- [ ] **Step 1: mutations**

invalidate `['squads']`、`['squad', id]`、`['agents']` 不必；AssigneeSelect 依赖 agents/squads 列表。

- [ ] **Step 2: SquadsPage**

- 「新建小队」：name、leader 下拉、members 多选 checkbox、protocol/directive textarea  
- EmptyState 文案改为「创建一个小队开始协作」  
- 列表显示 leader 名（需 API 带 leaderId + 客户端 map agents，或后端嵌 leaderName——**后端 PATCH 列表返回 leaderId 即可**）

- [ ] **Step 3: SquadDetailPage 可编辑**

- 只读展示升级为表单：protocol、directive、leader、members  
- 保存 PATCH  
- 删除（confirm）  
- 保留链到 agent 详情  

- [ ] **Step 4: 指派回归手测说明写 handoff**

新建 agent → 新建 squad（leader=新 agent）→ 看板 NewIssue 指派 squad → 应 enqueue leader run（无 CLI 可 failed，但 run 行存在）。

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(bu02): squads create/edit UI"
```

---

### Task 6: 端到端回归 + handoff + 进度

**Files:**
- Create: `app/.progress/bu02-impl-1.md` / `bu02-impl-2.md`  
- Modify: `docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md` 进度表

- [ ] **Step 1: 全量 typecheck**

```bash
cd app && pnpm -r typecheck
```

- [ ] **Step 2: API 回归矩阵（写进 handoff）**

| 调用 | 期望 |
|---|---|
| POST agent | 201 |
| GET readiness | status 枚举 |
| PATCH agent instructions | 持久化 |
| POST squad + members | loadSquadDetail 非空 |
| DELETE agent 当 leader | 409 |
| DELETE agent 无引用 | 204 |
| GET issues/wiki/memory/inbox | 200 |
| 指派新 agent 建 issue | enqueue run |

- [ ] **Step 3: 验收勾选**

- [ ] UI 可建 Agent（非 seed id）  
- [ ] UI 可建 Squad 并编辑 protocol  
- [ ] Instructions 进入 prompt（可看 run 或单测拼接；至少 DB 字段非空 + 代码路径存在）  
- [ ] Runs Tab 有数据或空态  
- [ ] readiness 在 runtime 缺失时为 `runtime_missing`  
- [ ] typecheck 绿  
- [ ] 无 wiki/db 误提交  

- [ ] **Step 4: Commit docs + push 分支**

```bash
git push -u origin feat/bu02-roster-ops
```

---

## 执行者拆分（厚棒）

| 棒 | Tasks | 工作量 |
|---|---|---|
| **impl-1** | Task 1–3 | schema + **全部** Agent/Squad API + readiness + runs + prompt 注入；handoff 含 API smoke |
| **impl-2** | Task 4–6 | **全部** Web 运营 UI + 回归 handoff；可开 PR |

impl-1 **不要**只留半残 GET；POST/PATCH/DELETE 必须在 impl-1 完成，impl-2 专心 UI。

---

## Self-Review

| Spec 包 C/D 要求 | Task |
|---|---|
| Agent CRUD | Task 2 |
| instructions | Task 1–2 + 4 |
| readiness | Task 2 + 4 |
| 详情 Tab Runs/Skills/MCP/Instructions | Task 4（Skills/MCP 已有） |
| Squad CRUD + members + protocol | Task 3 + 5 |
| 不改 seed 能跑指派 | Task 6 |
| 无 Redis / 无 squad_task | 全程 |

无 TBD；删除/冲突规则已写死。

---

## 明确不做（补2）

- Quick-create（补3）  
- Autopilot / Settings 页（补4/5）  
- Agent 作为 inbox recipient  
- 8 Tab 抄满 Multica  
- 多机 daemon  

---

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-07-17-bu02-roster-ops.md`.**

本项目固定：**计划者只验收**；人派执行者。  
默认：**worktree + impl-1（Task 1–3）→ 计划者验收 → impl-2（Task 4–6）**。

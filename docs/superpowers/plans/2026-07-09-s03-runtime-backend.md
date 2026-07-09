# S03 RuntimeBackend 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本项目工程模式：** AGENTS.md 垂直切片 × 计划者-执行者。片段由**新会话**执行；交接 `app/.progress/s03-*.md`。
> **spec 真源：** [`docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md`](../specs/2026-07-09-s03-runtime-backend-design.md)
> **前置：** [`s02-planner-2.md`](../../../app/.progress/s02-planner-2.md) · [`s03-planner-1.md`](../../../app/.progress/s03-planner-1.md) · [`borrow-from-references.md`](../../../design/borrow-from-references.md)

**Goal:** 三 CLI（Claude Code / opencode / Cursor）真实执行：指派 agent 即跑、可取消、`run_message` 回放、progress 仅 WS、双栏 `/runtimes`、终态 agent comment。

**Architecture:** 主进程 RunWorker + spawn CLI 子进程；`agent_run` 状态机；`run_message` 对齐 multica task_message；progress fire-and-forget；Pi 仅参考事件形状。

**Tech Stack:** 现有 monorepo + `node:child_process` spawn + AbortSignal（可选 `tree-kill` 包）

---

## Global Constraints

- **分支：** 从最新 `main` 开 `feat/s03-runtime-backend`
- **端口：** :3001 / :3000
- **cwd：** `process.env.MA_WORKSPACE_CWD`（必填才能成功跑）
- **LOCAL_MEMBER：** 仅人评论；agent 摘要 comment 用 `authorType=agent`
- **取消：** 仅 `POST /api/runs/:runId/cancel`
- **Pi：** 不实现 PiBackend
- **不动：** `references/repos/`、`chanpin/prototype/`
- **Commits：** `feat(s03):` / `docs(s03):`
- **Borrow：** 每 Task handoff 注明 G-BACKEND / G-DETECT 等 ID

## 文件结构

```
app/packages/
├── shared/src/schema.ts              MODIFY — Run 契约 + assignee + UpdateIssue.assignee
├── server/src/
│   ├── db/schema.ts                  MODIFY — agent.runtime, agent_run, run_message
│   ├── db/seed.ts                    MODIFY — runtime 绑定
│   ├── db/reshape.ts                 MODIFY — toAgentRun, toRunMessage
│   ├── local-member.ts               保持
│   ├── runtime/
│   │   ├── types.ts                  CREATE — RuntimeBackend 接口（可 re-export shared）
│   │   ├── registry.ts               CREATE
│   │   ├── detect-path.ts            CREATE — LookPath 工具
│   │   ├── claude-code.ts            CREATE
│   │   ├── opencode.ts               CREATE
│   │   ├── cursor.ts                 CREATE
│   │   └── prompt.ts                 CREATE — 组装 prompt K=20
│   ├── orchestration/
│   │   ├── run-worker.ts             CREATE
│   │   ├── run-control.ts            CREATE — cancel + AbortController map
│   │   └── event-bus.ts              保持（类型随 DomainEvent）
│   ├── routes/
│   │   ├── issues.ts                 MODIFY — assignee + enqueue
│   │   ├── runs.ts                   CREATE
│   │   ├── runtimes.ts               CREATE
│   │   └── roster.ts                 MODIFY — agents 含 runtime
│   └── index.ts / app.ts             MODIFY — 注册路由 + start worker
└── web/
    ├── app/runtimes/page.tsx         CREATE
    ├── app/layout.tsx                MODIFY — 顶栏导航
    ├── components/
    │   ├── AssigneeSelect.tsx        CREATE
    │   ├── RunStatusBar.tsx          CREATE
    │   ├── RunTrace.tsx              CREATE
    │   ├── RuntimesPage.tsx          CREATE
    │   ├── IssueHeader.tsx           MODIFY — 挂指派
    │   └── IssueDetail.tsx           MODIFY — 挂 Run*
    └── lib/api.ts · ws.ts            MODIFY
```

---

# 执行者片段 A（impl-1）：shared + DB + seed

> 读 spec §3–§4 · 本 Task 组 · s03-planner-1。分支 `feat/s03-runtime-backend`。产出 `s03-impl-1.md`。

### Task 1.1: 分支

- [ ] **Step 1**

```bash
cd D:/code/multi-agent
git checkout main
git pull origin main
git checkout -b feat/s03-runtime-backend
```

---

### Task 1.2: shared 契约扩展

**Files:** Modify `app/packages/shared/src/schema.ts`

- [ ] **Step 1: 在 schema 中追加（保留现有类型）**

在 `CommentType` 之后增加：

```typescript
export const RuntimeId = z.enum(['claude-code', 'opencode', 'cursor']);
export type RuntimeId = z.infer<typeof RuntimeId>;

export const AgentRunStatus = z.enum([
  'queued', 'running', 'completed', 'failed', 'cancelled',
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

export const RunMessageKind = z.enum([
  'assistant', 'user', 'tool_start', 'tool_end', 'system',
]);
export type RunMessageKind = z.infer<typeof RunMessageKind>;

export const AgentRun = z.object({
  id: BusinessId,
  issueId: BusinessId,
  agentId: BusinessId,
  runtime: RuntimeId,
  status: AgentRunStatus,
  error: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const RunMessage = z.object({
  id: BusinessId,
  runId: BusinessId,
  seq: z.number().int(),
  kind: RunMessageKind,
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type RunMessage = z.infer<typeof RunMessage>;

export const RuntimeInfo = z.object({
  id: RuntimeId,
  label: z.string(),
  installed: z.boolean(),
  version: z.string().nullable(),
  path: z.string().nullable(),
  agentIds: z.array(BusinessId),
});
export type RuntimeInfo = z.infer<typeof RuntimeInfo>;

export const RuntimesResponse = z.object({
  machine: z.object({
    id: z.literal('machine-local'),
    name: z.string(),
    status: z.literal('online'),
    cwd: z.string().nullable(),
  }),
  runtimes: z.array(RuntimeInfo),
});
export type RuntimesResponse = z.infer<typeof RuntimesResponse>;
```

- [ ] **Step 2: 改 UpdateIssueInput + validateUpdateIssue**

```typescript
export const UpdateIssueInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: IssueStatus.optional(),
  priority: Priority.optional(),
  position: z.number().optional(),
  assignee: z
    .object({ type: AssigneeType, id: BusinessId })
    .nullable()
    .optional(),
});

export function validateUpdateIssue(d: UpdateIssueInput): boolean {
  return (
    d.title !== undefined ||
    d.description !== undefined ||
    d.status !== undefined ||
    d.priority !== undefined ||
    d.position !== undefined ||
    d.assignee !== undefined
  );
}
```

- [ ] **Step 3: AgentSummary 加 runtime**

```typescript
export const AgentSummary = z.object({
  id: BusinessId,
  name: z.string(),
  runtime: RuntimeId,
});
```

- [ ] **Step 4: WS 事件扩展 + DomainEvent**

```typescript
export const RunLifecycleEvent = z.object({
  type: z.enum([
    'run:queued',
    'run:running',
    'run:completed',
    'run:failed',
    'run:cancelled',
  ]),
  run: AgentRun,
});
export type RunLifecycleEvent = z.infer<typeof RunLifecycleEvent>;

export const RunProgressEvent = z.object({
  type: z.literal('run:progress'),
  runId: BusinessId,
  issueId: BusinessId,
  text: z.string(),
});
export type RunProgressEvent = z.infer<typeof RunProgressEvent>;

export const RunMessageEvent = z.object({
  type: z.literal('run:message'),
  message: RunMessage,
  issueId: BusinessId,
});
export type RunMessageEvent = z.infer<typeof RunMessageEvent>;

export type DomainEvent =
  | IssueCreatedEvent
  | IssueUpdatedEvent
  | CommentCreatedEvent
  | RunLifecycleEvent
  | RunProgressEvent
  | RunMessageEvent;
```

- [ ] **Step 5: typecheck + commit**

```bash
cd D:/code/multi-agent/app
pnpm --filter @ma/shared typecheck
git add app/packages/shared
git commit -m "feat(s03): shared Run/Runtime 契约 + UpdateIssue.assignee"
```

---

### Task 1.3: Drizzle schema + migration

**Files:** Modify `app/packages/server/src/db/schema.ts`

- [ ] **Step 1: agents 表加 runtime**

```typescript
export const agents = sqliteTable('agent', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category'),
  runtime: text('runtime', { enum: ['claude-code', 'opencode', 'cursor'] }).notNull().default('claude-code'),
  createdAt: integer('created_at').notNull(),
});
```

- [ ] **Step 2: 追加 agent_runs / run_messages**

```typescript
export const agentRuns = sqliteTable(
  'agent_run',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id').notNull().references(() => issues.id),
    agentId: text('agent_id').notNull(),
    runtime: text('runtime', { enum: ['claude-code', 'opencode', 'cursor'] }).notNull(),
    status: text('status', {
      enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
    }).notNull(),
    error: text('error'),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    issueIdx: index('idx_agent_run_issue').on(t.issueId),
    statusIdx: index('idx_agent_run_status').on(t.status),
  }),
);

export const runMessages = sqliteTable(
  'run_message',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull().references(() => agentRuns.id),
    seq: integer('seq').notNull(),
    kind: text('kind', {
      enum: ['assistant', 'user', 'tool_start', 'tool_end', 'system'],
    }).notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    runSeqIdx: index('idx_run_message_run_seq').on(t.runId, t.seq),
  }),
);
```

- [ ] **Step 3: generate + 重置 migrate**

```bash
cd D:/code/multi-agent/app
pnpm --filter @ma/server db:generate
# 确认 drizzle/ 出现 0002_*.sql
Remove-Item -ErrorAction SilentlyContinue packages/server/dev.db, packages/server/dev.db-shm, packages/server/dev.db-wal
pnpm --filter @ma/server db:migrate
```

- [ ] **Step 4: commit**

```bash
git add app/packages/server/src/db/schema.ts app/packages/server/drizzle
git commit -m "feat(s03): agent.runtime + agent_run + run_message schema"
```

---

### Task 1.4: seed + reshape

**Files:** Modify `seed.ts`, `reshape.ts`

- [ ] **Step 1: seed agents 带 runtime**

```typescript
db.insert(agents)
  .values([
    { id: 'agt-lead', name: '产品·策划队长', category: '产品', runtime: 'claude-code', createdAt: NOW },
    { id: 'agt-research', name: '产品·调研与洞察官', category: '产品', runtime: 'opencode', createdAt: NOW },
    { id: 'agt-prd', name: '产品·需求与PRD官', category: '产品', runtime: 'cursor', createdAt: NOW },
    { id: 'agt-proto', name: '产品·设计·原型官', category: '产品', runtime: 'claude-code', createdAt: NOW },
  ])
  .run();
```

- [ ] **Step 2: reshape 增加 toAgentRun / toRunMessage**

```typescript
import type { AgentRun, RunMessage } from '@ma/shared';
import { agentRuns, runMessages } from './schema.js';

type RunRow = typeof agentRuns.$inferSelect;
type MsgRow = typeof runMessages.$inferSelect;

function iso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

export function toAgentRun(row: RunRow): AgentRun {
  return {
    id: row.id,
    issueId: row.issueId,
    agentId: row.agentId,
    runtime: row.runtime,
    status: row.status,
    error: row.error,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export function toRunMessage(row: MsgRow): RunMessage {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    kind: row.kind,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
```

注意：`AgentRun.startedAt` 等在 Zod 为 `datetime().nullable()` 时，API 返回 `null` 用 ISO 或 null；确保与 schema 一致（若 Zod 要 string|null，toAgentRun 如上）。

- [ ] **Step 3: seed + typecheck**

```bash
pnpm --filter @ma/server db:seed
pnpm --filter @ma/server typecheck
# 预期：8 issue + 6 comment；agents 有 runtime
```

- [ ] **Step 4: handoff `app/.progress/s03-impl-1.md` + commit**

写：完成内容、typecheck 输出、migration 文件名、seed 三 runtime、给 impl-2 注意点（表名 agent_run/run_message、assignee 已进 shared 但 PUT 未接）。

```bash
git add app/packages/server/src/db app/.progress/s03-impl-1.md
git commit -m "feat(s03): seed runtime 绑定 + toAgentRun；docs impl-1 handoff"
```

---

# 执行者片段 B（impl-2）：Backend + Worker + API

> 读 spec §5–§8 · s03-impl-1 · 本 Task 组。同一分支。产出 `s03-impl-2.md`。

### Task 2.1: RuntimeBackend 接口 + detect + registry

**Files:** Create under `app/packages/server/src/runtime/`

- [ ] **Step 1: `types.ts`**

```typescript
import type { RuntimeId } from '@ma/shared';
// 进程内 AgentEvent 仅 server 使用（不进 shared WS 契约）：

export type AgentEvent =
  | { type: 'message_delta'; text: string }
  | { type: 'message'; role: 'assistant' | 'user'; text: string }
  | { type: 'tool_start'; name: string; args?: unknown }
  | { type: 'tool_end'; name: string; result?: string }
  | { type: 'log'; text: string };

export interface ExecutionInput {
  prompt: string;
  cwd: string;
  issueId: string;
  agentId: string;
  runId: string;
}

export interface ExecutionResult {
  finalText: string;
  exitReason: 'completed' | 'cancelled' | 'failed';
  error?: string;
}

export interface DetectResult {
  installed: boolean;
  version: string | null;
  path: string | null;
}

export interface RuntimeBackend {
  readonly id: RuntimeId;
  readonly label: string;
  detect(): Promise<DetectResult>;
  execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult>;
}
```

修正：不要写 `Execution-facing`——上表已完整。

- [ ] **Step 2: `detect-path.ts`**

```typescript
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function resolveCmd(
  envKey: string,
  candidates: string[],
): Promise<string | null> {
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    try {
      await access(fromEnv, constants.X_OK);
      return fromEnv;
    } catch {
      /* fallthrough */
    }
  }
  for (const c of candidates) {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(cmd, [c], { windowsHide: true });
      const line = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (line) return line;
    } catch {
      /* next */
    }
  }
  return null;
}

export async function versionOf(bin: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: 8000,
      windowsHide: true,
    });
    const t = (stdout || stderr).trim().split(/\r?\n/)[0];
    return t || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: 三 Backend 骨架（先 Claude 真解析，另两个可整段 stdout）**

`claude-code.ts` 核心：

```typescript
import { spawn } from 'node:child_process';
import type { RuntimeBackend, ExecutionInput, AgentEvent, ExecutionResult, DetectResult } from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';

export class ClaudeCodeBackend implements RuntimeBackend {
  readonly id = 'claude-code' as const;
  readonly label = 'Claude Code';

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('CLAUDE_PATH', ['claude']);
    if (!path) return { installed: false, version: null, path: null };
    const version = await versionOf(path);
    return { installed: true, version, path };
  }

  async execute(input: ExecutionInput, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.path) {
      return { finalText: '', exitReason: 'failed', error: 'claude CLI 未安装' };
    }
    const args = ['-p', input.prompt, '--output-format', 'stream-json', '--verbose'];
    return spawnCollect(det.path, args, input.cwd, signal, onEvent, parseClaudeLine);
  }
}

// spawnCollect: 通用 spawn；line handler 可选
// parseClaudeLine: 尽力解析 JSON 行 → message_delta / tool_*；失败则 ignore
// signal 时 child.kill()；win32 可 child.kill() 后 taskkill
```

`opencode.ts`：`opencode run` + prompt；detect `OPENCODE_PATH` / `opencode`。  
`cursor.ts`：spike 后钉死 argv（如 `cursor agent -p` 或文档 headless）；detect `CURSOR_PATH` / `cursor`。  
**实现时把最终 argv 写进 handoff。**

- [ ] **Step 4: `registry.ts`**

```typescript
import type { RuntimeId } from '@ma/shared';
import type { RuntimeBackend } from './types.js';
import { ClaudeCodeBackend } from './claude-code.js';
import { OpencodeBackend } from './opencode.js';
import { CursorBackend } from './cursor.js';

const list: RuntimeBackend[] = [
  new ClaudeCodeBackend(),
  new OpencodeBackend(),
  new CursorBackend(),
];

export function getBackend(id: RuntimeId): RuntimeBackend {
  const b = list.find((x) => x.id === id);
  if (!b) throw new Error(`unknown runtime ${id}`);
  return b;
}

export function allBackends(): RuntimeBackend[] {
  return list;
}
```

- [ ] **Step 5: commit**

```bash
git add app/packages/server/src/runtime
git commit -m "feat(s03): RuntimeBackend 三实现骨架 + detect"
```

---

### Task 2.2: run-control + prompt + RunWorker

**Files:** Create `run-control.ts`, `prompt.ts`, `run-worker.ts`

- [ ] **Step 1: `orchestration/run-control.ts`**

```typescript
const aborts = new Map<string, AbortController>();

export function registerRunAbort(runId: string): AbortSignal {
  const c = new AbortController();
  aborts.set(runId, c);
  return c.signal;
}

export function abortRun(runId: string): boolean {
  const c = aborts.get(runId);
  if (!c) return false;
  c.abort();
  aborts.delete(runId);
  return true;
}

export function clearRunAbort(runId: string): void {
  aborts.delete(runId);
}
```

- [ ] **Step 2: `runtime/prompt.ts`**

```typescript
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues, comments } from '../db/schema.js';

const K = 20;

export function buildPrompt(issueId: string): string | null {
  const issue = db.select().from(issues).where(eq(issues.id, issueId)).get();
  if (!issue) return null;
  const rows = db
    .select()
    .from(comments)
    .where(eq(comments.issueId, issueId))
    .orderBy(desc(comments.createdAt))
    .limit(K)
    .all()
    .reverse();
  const history = rows
    .map((c) => `[${c.authorType}:${c.authorId}] ${c.body}`)
    .join('\n\n');
  return [
    `Issue ${issue.identifier}: ${issue.title}`,
    issue.description ? `Description:\n${issue.description}` : '',
    history ? `Recent comments:\n${history}` : '',
    'Please work on this issue in the current workspace.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
```

- [ ] **Step 3: `orchestration/run-worker.ts`（核心逻辑）**

要点（完整实现时按此语义）：

1. `setInterval(tick, 500)` 或循环  
2. claim：取一条 `status=queued`，UPDATE `running` + `started_at`  
3. `registerRunAbort(runId)`  
4. 检查 `MA_WORKSPACE_CWD`  
5. `getBackend(run.runtime).execute(...)`  
6. onEvent：  
   - `message_delta`/`log` → `eventBus.publish({ type:'run:progress', ...})`  
   - `message`/`tool_*` → insert run_message seq++ + `run:message`  
7. 结果：  
   - completed → update run + insert comment agent + `comment:created` + `run:completed`  
   - cancelled/failed 类似  
8. `clearRunAbort`  
9. 导出 `wakeRunWorker()` 空实现即可（interval 已轮询）

- [ ] **Step 4: commit**

```bash
git add app/packages/server/src/orchestration app/packages/server/src/runtime/prompt.ts
git commit -m "feat(s03): RunWorker + prompt + abort registry"
```

---

### Task 2.3: routes — runs, runtimes, issues assignee, roster

**Files:** Create `routes/runs.ts`, `routes/runtimes.ts`；Modify `issues.ts`, `roster.ts`, `app.ts`, `index.ts`

- [ ] **Step 1: `runtimes.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { agents } from '../db/schema.js';
import { allBackends } from '../runtime/registry.js';

export async function runtimeRoutes(app: FastifyInstance) {
  app.get('/api/runtimes', async () => {
    const agentRows = db.select().from(agents).all();
    const runtimes = [];
    for (const b of allBackends()) {
      const d = await b.detect();
      const agentIds = agentRows.filter((a) => a.runtime === b.id).map((a) => a.id);
      runtimes.push({
        id: b.id,
        label: b.label,
        installed: d.installed,
        version: d.version,
        path: d.path,
        agentIds,
      });
    }
    return {
      machine: {
        id: 'machine-local' as const,
        name: '林远 本机',
        status: 'online' as const,
        cwd: process.env.MA_WORKSPACE_CWD ?? null,
      },
      runtimes,
    };
  });
}
```

- [ ] **Step 2: `runs.ts`** — GET list/by id/messages；POST cancel（条件 update + `abortRun` + WS）

- [ ] **Step 3: `roster.ts`** agents map 含 `runtime: a.runtime`

- [ ] **Step 4: `issues.ts` PUT**

在 updates 中：

```typescript
if (input.assignee !== undefined) {
  updates.assigneeType = input.assignee?.type ?? null;
  updates.assigneeId = input.assignee?.id ?? null;
}
```

事务后（或事务内）比较 prev assignee vs new：

```typescript
function assigneeKey(t: string | null, id: string | null) {
  return t && id ? `${t}:${id}` : '';
}
const prevKey = assigneeKey(prev.assigneeType, prev.assigneeId);
const nextType = input.assignee !== undefined ? (input.assignee?.type ?? null) : prev.assigneeType;
const nextId = input.assignee !== undefined ? (input.assignee?.id ?? null) : prev.assigneeId;
const nextKey = assigneeKey(nextType, nextId);

if (input.assignee !== undefined && prevKey !== nextKey) {
  // cancel active runs for issue
  // if nextType === 'agent' && nextId: load agent.runtime, insert agent_run queued, publish run:queued
}
```

cancel active / insert run 抽到 `orchestration/run-service.ts` 更清晰（可选文件）。

- [ ] **Step 5: `app.ts` 注册 routes；`index.ts` 启动后 `startRunWorker()`**

- [ ] **Step 6: 自测**

```bash
$env:MA_WORKSPACE_CWD="D:\code\multi-agent"   # 或你的仓库路径
pnpm --filter @ma/server dev
# GET /api/runtimes
# PUT issue assignee agent → GET runs
# POST cancel
# 三 CLI 各跑一次（本机已装）
```

- [ ] **Step 7: handoff s03-impl-2.md + commit**

```bash
git commit -m "feat(s03): runs API + 指派即跑 + cancel + runtimes"
git commit -m "docs(s03): impl-2 handoff"
```

---

# 执行者片段 C（impl-3）：web

> 读 spec §9、§12 · s03-impl-2。产出 `s03-impl-3.md`。

### Task 3.1: api + ws

**Files:** `lib/api.ts`, `lib/ws.ts`

- [ ] **Step 1: hooks**

```typescript
// useRuntimes → GET /api/runtimes
// useRuns(issueId) → GET /api/runs?issueId=
// useRunMessages(runId) → GET /api/runs/:id/messages
// useCancelRun → POST /api/runs/:id/cancel
// useUpdateIssue 已支持 body.assignee（确认类型）
// useAgents 类型含 runtime
```

- [ ] **Step 2: ws 处理 run:lifecycle / run:message / run:progress**

```typescript
// run:* lifecycle → setQueryData ['runs', issueId]
// run:message → append ['run-messages', runId] by id
// run:progress → 可选 zustand ephemeral text by runId（不进 messages）
// comment:created 保持
```

- [ ] **Step 3: commit** `feat(s03): web hooks + WS run events`

---

### Task 3.2: 详情指派 / 停止 / 轨迹

**Files:** Create AssigneeSelect, RunStatusBar, RunTrace；Modify IssueHeader, IssueDetail

- [ ] **Step 1: AssigneeSelect** — agents 下拉，显示 `name · runtime`；confirm 后 `update.mutate({ id, input: { assignee: { type:'agent', id }}})`；选项「未指派」→ `assignee: null`

- [ ] **Step 2: RunStatusBar** — 从 runs 找 active 或最新；显示 status；停止调用 cancel

- [ ] **Step 3: RunTrace** — messages 列表；kind 样式区分

- [ ] **Step 4: IssueDetail 组装**

- [ ] **Step 5: commit** `feat(s03): 详情指派/停止/运行轨迹`

---

### Task 3.3: /runtimes 双栏 + 导航

**Files:** `components/RuntimesPage.tsx`, `app/runtimes/page.tsx`, `layout.tsx`, `globals.css`

- [ ] **Step 1: UI 按 spec §9.3 / 原型双栏**

左：本机卡；右：头 + 表 5 列；费用 `—`；按钮重新探测 `refetch`

- [ ] **Step 2: layout 顶栏**

```tsx
<nav>
  <Link href="/">看板</Link>
  {' · '}
  <Link href="/runtimes">运行时</Link>
</nav>
{children}
```

- [ ] **Step 3: typecheck**

```bash
pnpm -r typecheck
```

- [ ] **Step 4: §12 浏览器验收**（三 CLI 各一次；FRI-11 改指派 agent）

- [ ] **Step 5: handoff s03-impl-3.md + commit + push**

```bash
git push -u origin feat/s03-runtime-backend
```

---

## Plan Self-Review

| Spec 需求 | Task |
|---|---|
| shared Run 契约 + assignee | 1.2 |
| agent.runtime + tables | 1.3–1.4 |
| Backend 三实现 + detect | 2.1 |
| Worker + prompt K=20 | 2.2 |
| PUT 指派即跑 + cancel + runtimes API | 2.3 |
| 详情 UI + /runtimes 双栏 | 3.2–3.3 |
| 三 CLI 验收 | 2.3 自测 + 3.4 |
| progress 不进 DB | 2.2 onEvent |
| 终态 comment | 2.2 |
| Borrow 文档 | Global Constraints |

**无 TBD。** Cursor argv 由 impl-2 spike 写入 handoff（spec R5 允许）。

---

## 执行方式（计划者）

Plan 已保存。可选：

1. **新会话执行者**（推荐，项目惯例）— 用 `s03-impl-1-kickoff`  
2. **本会话 Subagent / Inline**  

需要 kickoff 提示词时说一声即可。

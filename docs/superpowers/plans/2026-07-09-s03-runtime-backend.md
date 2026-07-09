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
│   │   ├── spawn-line.ts             CREATE — 通用 spawn + 取消杀进程
│   │   ├── claude-code.ts            CREATE
│   │   ├── opencode.ts               CREATE
│   │   ├── cursor.ts                 CREATE
│   │   └── prompt.ts                 CREATE — 组装 prompt K=20
│   ├── orchestration/
│   │   ├── run-worker.ts             CREATE
│   │   ├── run-control.ts            CREATE — AbortController map
│   │   ├── run-service.ts            CREATE — enqueue / cancelActive
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

- [ ] **Step 3a: 通用 `spawn-line.ts`（三 Backend 共用）**

```typescript
// app/packages/server/src/runtime/spawn-line.ts
import { spawn } from 'node:child_process';
import type { AgentEvent, ExecutionResult } from './types.js';

export type LineHandler = (line: string, onEvent: (e: AgentEvent) => void) => void;

export function spawnLineProcess(
  bin: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  onEvent: (e: AgentEvent) => void,
  onLine: LineHandler | null,
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let buf = '';
    let stdoutAll = '';
    let stderrAll = '';
    let settled = false;

    const finish = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const onAbort = () => {
      try {
        child.kill('SIGTERM');
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        }
      } catch {
        /* ignore */
      }
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutAll += chunk;
      if (!onLine) return;
      buf += chunk;
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? '';
      for (const line of parts) {
        if (line.trim()) onLine(line, onEvent);
      }
    });
    child.stderr?.on('data', (chunk: string) => {
      stderrAll += chunk;
      onEvent({ type: 'log', text: chunk });
    });
    child.on('error', (err) => {
      finish({ finalText: '', exitReason: 'failed', error: String(err) });
    });
    child.on('close', (code) => {
      if (signal.aborted) {
        finish({ finalText: stdoutAll.trim(), exitReason: 'cancelled' });
        return;
      }
      if (buf.trim() && onLine) onLine(buf, onEvent);
      if (!onLine && stdoutAll.trim()) {
        onEvent({ type: 'message', role: 'assistant', text: stdoutAll.trim() });
      }
      if (code === 0) {
        finish({ finalText: stdoutAll.trim(), exitReason: 'completed' });
      } else {
        finish({
          finalText: stdoutAll.trim(),
          exitReason: 'failed',
          error: stderrAll.trim() || `exit ${code}`,
        });
      }
    });
  });
}
```

- [ ] **Step 3b: `claude-code.ts`**

```typescript
import type { RuntimeBackend, DetectResult, ExecutionInput, AgentEvent, ExecutionResult } from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess } from './spawn-line.js';

function parseClaudeLine(line: string, onEvent: (e: AgentEvent) => void): void {
  try {
    const j = JSON.parse(line) as Record<string, unknown>;
    // 尽力映射常见 stream-json 形态；字段名随 CLI 版本可能变化
    if (j.type === 'stream_event' || j.type === 'content_block_delta') {
      const text =
        (j as { event?: { delta?: { text?: string } } }).event?.delta?.text ??
        (j as { delta?: { text?: string } }).delta?.text;
      if (text) onEvent({ type: 'message_delta', text });
    }
    if (j.type === 'assistant' && typeof j.message === 'object') {
      // 忽略或展开
    }
    if (j.type === 'tool_use' || (j as { name?: string }).name) {
      const name = String((j as { name?: string }).name ?? 'tool');
      onEvent({ type: 'tool_start', name, args: j });
    }
    if (j.type === 'tool_result') {
      onEvent({
        type: 'tool_end',
        name: String((j as { name?: string }).name ?? 'tool'),
        result: JSON.stringify(j).slice(0, 4000),
      });
    }
  } catch {
    /* 非 JSON 行忽略 */
  }
}

export class ClaudeCodeBackend implements RuntimeBackend {
  readonly id = 'claude-code' as const;
  readonly label = 'Claude Code';

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('CLAUDE_PATH', ['claude']);
    if (!path) return { installed: false, version: null, path: null };
    return { installed: true, version: await versionOf(path), path };
  }

  async execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.path) return { finalText: '', exitReason: 'failed', error: 'claude CLI 未安装' };
    return spawnLineProcess(
      det.path,
      ['-p', input.prompt, '--output-format', 'stream-json', '--verbose'],
      input.cwd,
      signal,
      onEvent,
      parseClaudeLine,
    );
  }
}
```

- [ ] **Step 3c: `opencode.ts`（整段 stdout 降级，spec R5）**

```typescript
import type { RuntimeBackend, DetectResult, ExecutionInput, AgentEvent, ExecutionResult } from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess } from './spawn-line.js';

export class OpencodeBackend implements RuntimeBackend {
  readonly id = 'opencode' as const;
  readonly label = 'Opencode';

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('OPENCODE_PATH', ['opencode']);
    if (!path) return { installed: false, version: null, path: null };
    return { installed: true, version: await versionOf(path), path };
  }

  async execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.path) return { finalText: '', exitReason: 'failed', error: 'opencode CLI 未安装' };
    // argv 若 spike 发现不同，改这里并记 handoff
    return spawnLineProcess(
      det.path,
      ['run', input.prompt],
      input.cwd,
      signal,
      onEvent,
      null, // 无 stream：spawn-line 结束时整段 assistant message
    );
  }
}
```

- [ ] **Step 3d: `cursor.ts`（默认 headless 形态；spike 后可改 argv）**

```typescript
import type { RuntimeBackend, DetectResult, ExecutionInput, AgentEvent, ExecutionResult } from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess } from './spawn-line.js';

export class CursorBackend implements RuntimeBackend {
  readonly id = 'cursor' as const;
  readonly label = 'Cursor';

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('CURSOR_PATH', ['cursor', 'cursor-agent']);
    if (!path) return { installed: false, version: null, path: null };
    return { installed: true, version: await versionOf(path), path };
  }

  async execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.path) return { finalText: '', exitReason: 'failed', error: 'cursor CLI 未安装' };
    // 默认尝试 --headless；本机 spike 失败则改 argv 并写入 s03-impl-2 handoff
    return spawnLineProcess(
      det.path,
      ['--headless', input.prompt],
      input.cwd,
      signal,
      onEvent,
      null,
    );
  }
}
```

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

- [ ] **Step 3: `orchestration/run-worker.ts`**

```typescript
import { eq, and, inArray, asc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, runMessages, comments } from '../db/schema.js';
import { toAgentRun, toRunMessage, toComment } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { registerRunAbort, clearRunAbort } from './run-control.js';
import { getBackend } from '../runtime/registry.js';
import { buildPrompt } from '../runtime/prompt.js';
import type { AgentEvent } from '../runtime/types.js';

let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;

export function startRunWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, 500);
}

export function wakeRunWorker(): void {
  void tick();
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const queued = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.status, 'queued'))
      .orderBy(asc(agentRuns.createdAt))
      .limit(1)
      .get();
    if (!queued) return;

    const now = Date.now();
    const claimed = db
      .update(agentRuns)
      .set({ status: 'running', startedAt: now })
      .where(and(eq(agentRuns.id, queued.id), eq(agentRuns.status, 'queued')))
      .returning()
      .get?.();
    // better-sqlite3 drizzle: 无 returning 时再 select
    const runRow =
      claimed ??
      db.select().from(agentRuns).where(eq(agentRuns.id, queued.id)).get();
    if (!runRow || runRow.status !== 'running') return;

    const run = toAgentRun(runRow);
    eventBus.publish({ type: 'run:running', run });

    const cwd = process.env.MA_WORKSPACE_CWD;
    if (!cwd) {
      await failRun(runRow.id, runRow.issueId, '未配置 MA_WORKSPACE_CWD');
      return;
    }
    const prompt = buildPrompt(runRow.issueId);
    if (!prompt) {
      await failRun(runRow.id, runRow.issueId, 'issue 不存在');
      return;
    }

    const signal = registerRunAbort(runRow.id);
    let seq = 0;
    const nextSeq = () => ++seq;

    const onEvent = (e: AgentEvent) => {
      if (e.type === 'message_delta' || e.type === 'log') {
        eventBus.publish({
          type: 'run:progress',
          runId: runRow.id,
          issueId: runRow.issueId,
          text: e.type === 'log' ? e.text : e.text,
        });
        return;
      }
      let kind: 'assistant' | 'user' | 'tool_start' | 'tool_end' | 'system' = 'system';
      let body = '';
      if (e.type === 'message') {
        kind = e.role === 'user' ? 'user' : 'assistant';
        body = e.text;
      } else if (e.type === 'tool_start') {
        kind = 'tool_start';
        body = JSON.stringify({ name: e.name, args: e.args ?? null });
      } else if (e.type === 'tool_end') {
        kind = 'tool_end';
        body = JSON.stringify({ name: e.name, result: e.result ?? '' });
      }
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      const s = nextSeq();
      db.insert(runMessages)
        .values({ id, runId: runRow.id, seq: s, kind, body, createdAt })
        .run();
      const message = toRunMessage({
        id,
        runId: runRow.id,
        seq: s,
        kind,
        body,
        createdAt,
      });
      eventBus.publish({ type: 'run:message', message, issueId: runRow.issueId });
    };

    try {
      const backend = getBackend(runRow.runtime);
      const result = await backend.execute(
        {
          prompt,
          cwd,
          issueId: runRow.issueId,
          agentId: runRow.agentId,
          runId: runRow.id,
        },
        onEvent,
        signal,
      );
      clearRunAbort(runRow.id);
      const finishedAt = Date.now();
      if (result.exitReason === 'cancelled' || signal.aborted) {
        db.update(agentRuns)
          .set({ status: 'cancelled', finishedAt, error: result.error ?? null })
          .where(eq(agentRuns.id, runRow.id))
          .run();
        const r = toAgentRun(db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!);
        eventBus.publish({ type: 'run:cancelled', run: r });
        return;
      }
      if (result.exitReason === 'failed') {
        await failRun(runRow.id, runRow.issueId, result.error ?? '执行失败', result.finalText);
        return;
      }
      // completed
      db.update(agentRuns)
        .set({ status: 'completed', finishedAt, error: null })
        .where(eq(agentRuns.id, runRow.id))
        .run();
      const finalText = result.finalText || '(无输出)';
      const cid = crypto.randomUUID();
      db.insert(comments)
        .values({
          id: cid,
          issueId: runRow.issueId,
          type: 'comment',
          authorType: 'agent',
          authorId: runRow.agentId,
          body: finalText,
          createdAt: finishedAt,
        })
        .run();
      const cRow = db.select().from(comments).where(eq(comments.id, cid)).get()!;
      eventBus.publish({ type: 'comment:created', comment: toComment(cRow) });
      const r = toAgentRun(db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!);
      eventBus.publish({ type: 'run:completed', run: r });
    } catch (err) {
      clearRunAbort(runRow.id);
      await failRun(runRow.id, runRow.issueId, String(err));
    }
  } finally {
    busy = false;
  }
}

async function failRun(
  runId: string,
  issueId: string,
  error: string,
  finalText?: string,
): Promise<void> {
  const finishedAt = Date.now();
  db.update(agentRuns)
    .set({ status: 'failed', finishedAt, error })
    .where(eq(agentRuns.id, runId))
    .run();
  if (finalText) {
    // 可选：不写 comment
  }
  const r = toAgentRun(db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get()!);
  eventBus.publish({ type: 'run:failed', run: r });
}
```

注意：若当前 drizzle-orm 0.33 的 `update().returning()` 不可用，claim 后用 `select` 校验 `status==='running'` 即可（上面已兼容）。删掉未使用的 `inArray`/`sql` import 若 typecheck 报错。

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

- [ ] **Step 2: `orchestration/run-service.ts`（cancel + enqueue，供 issues/runs 共用）**

```typescript
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { abortRun } from './run-control.js';
import { wakeRunWorker } from './run-worker.js';

const ACTIVE = ['queued', 'running'] as const;

export function cancelActiveRunsForIssue(issueId: string): void {
  const rows = db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.issueId, issueId), inArray(agentRuns.status, [...ACTIVE])))
    .all();
  for (const row of rows) {
    cancelRunById(row.id);
  }
}

export function cancelRunById(runId: string): { ok: boolean; run?: ReturnType<typeof toAgentRun> } {
  const prev = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!prev || !ACTIVE.includes(prev.status as (typeof ACTIVE)[number])) {
    return { ok: false };
  }
  const finishedAt = Date.now();
  db.update(agentRuns)
    .set({ status: 'cancelled', finishedAt })
    .where(and(eq(agentRuns.id, runId), inArray(agentRuns.status, [...ACTIVE])))
    .run();
  abortRun(runId);
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get()!;
  const run = toAgentRun(row);
  eventBus.publish({ type: 'run:cancelled', run });
  return { ok: true, run };
}

export function enqueueAgentRun(issueId: string, agentId: string): ReturnType<typeof toAgentRun> | null {
  const active = db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.issueId, issueId), inArray(agentRuns.status, [...ACTIVE])))
    .get();
  if (active) return null;
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return null;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.insert(agentRuns)
    .values({
      id,
      issueId,
      agentId,
      runtime: agent.runtime,
      status: 'queued',
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt,
    })
    .run();
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()!;
  const run = toAgentRun(row);
  eventBus.publish({ type: 'run:queued', run });
  wakeRunWorker();
  return run;
}
```

- [ ] **Step 3: `routes/runs.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { eq, desc, asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, runMessages } from '../db/schema.js';
import { toAgentRun, toRunMessage } from '../db/reshape.js';
import { cancelRunById } from '../orchestration/run-service.js';

export async function runRoutes(app: FastifyInstance) {
  app.get('/api/runs', async (req) => {
    const q = req.query as { issueId?: string };
    if (!q.issueId) return [];
    const rows = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.issueId, q.issueId))
      .orderBy(desc(agentRuns.createdAt))
      .all();
    return rows.map(toAgentRun);
  });

  app.get('/api/runs/:runId', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (!row) return reply.status(404).send({ error: 'run 不存在' });
    return toAgentRun(row);
  });

  app.get('/api/runs/:runId/messages', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (!run) return reply.status(404).send({ error: 'run 不存在' });
    const rows = db
      .select()
      .from(runMessages)
      .where(eq(runMessages.runId, runId))
      .orderBy(asc(runMessages.seq))
      .all();
    return rows.map(toRunMessage);
  });

  app.post('/api/runs/:runId/cancel', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const res = cancelRunById(runId);
    if (!res.ok) return reply.status(409).send({ error: 'run 不可取消' });
    return res.run;
  });
}
```

- [ ] **Step 4: `roster.ts`** agents 映射加 `runtime: a.runtime`

```typescript
return rows.map((a) => ({ id: a.id, name: a.name, runtime: a.runtime }));
```

- [ ] **Step 5: `issues.ts` PUT 扩展 assignee + 副作用**

在 updates 构造中：

```typescript
if (input.assignee !== undefined) {
  updates.assigneeType = input.assignee?.type ?? null;
  updates.assigneeId = input.assignee?.id ?? null;
}
```

在 status 事务与 `issue:updated` 发布**之后**（assignee 变更独立于 status_change 事务亦可，但须同一请求内）：

```typescript
import { cancelActiveRunsForIssue, enqueueAgentRun } from '../orchestration/run-service.js';

function assigneeKey(t: string | null, id: string | null) {
  return t && id ? `${t}:${id}` : '';
}

// 在成功 update issue 之后：
if (input.assignee !== undefined) {
  const prevKey = assigneeKey(prev.assigneeType, prev.assigneeId);
  const nextType = input.assignee?.type ?? null;
  const nextId = input.assignee?.id ?? null;
  const nextKey = assigneeKey(nextType, nextId);
  if (prevKey !== nextKey) {
    cancelActiveRunsForIssue(id);
    if (nextType === 'agent' && nextId) {
      enqueueAgentRun(id, nextId);
    }
  }
}
```

- [ ] **Step 6: `app.ts` 注册 `runRoutes` + `runtimeRoutes`；`index.ts` 在 listen 前 `startRunWorker()`**

```typescript
// app.ts
import { runRoutes } from './routes/runs.js';
import { runtimeRoutes } from './routes/runtimes.js';
await app.register(runRoutes);
await app.register(runtimeRoutes);

// index.ts
import { startRunWorker } from './orchestration/run-worker.js';
startRunWorker();
await app.listen(...);
```

- [ ] **Step 7: 自测**

```bash
$env:MA_WORKSPACE_CWD="D:\code\multi-agent"
pnpm --filter @ma/server typecheck
pnpm --filter @ma/server dev
# GET /api/runtimes
# PUT /api/issues/:id {"assignee":{"type":"agent","id":"agt-lead"}}
# GET /api/runs?issueId=
# POST /api/runs/:runId/cancel
# 三 CLI 各指派对应 agent 跑通（agt-lead/research/prd）
```

- [ ] **Step 8: handoff + commit**

```bash
git add app/packages/server
git commit -m "feat(s03): runs API + 指派即跑 + cancel + runtimes"
# 写 s03-impl-2.md 后
git add app/.progress/s03-impl-2.md
git commit -m "docs(s03): impl-2 handoff"
```

---

# 执行者片段 C（impl-3）：web

> 读 spec §9、§12 · s03-impl-2。产出 `s03-impl-3.md`。

### Task 3.1: api + ws

**Files:** Modify `lib/api.ts`, `lib/ws.ts`

- [ ] **Step 1: 在 `api.ts` 追加 hooks（API 基址与现网一致 `http://localhost:3001/api`）**

```typescript
import type { AgentRun, RunMessage, RuntimesResponse, AgentSummary } from '@ma/shared';

export function useRuntimes() {
  return useQuery<RuntimesResponse>({
    queryKey: ['runtimes'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/runtimes`);
      if (!res.ok) throw new Error('runtimes');
      return res.json();
    },
  });
}

export function useRuns(issueId: string) {
  return useQuery<AgentRun[]>({
    queryKey: ['runs', issueId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/runs?issueId=${encodeURIComponent(issueId)}`);
      if (!res.ok) throw new Error('runs');
      return res.json();
    },
    enabled: !!issueId,
  });
}

export function useRunMessages(runId: string | undefined) {
  return useQuery<RunMessage[]>({
    queryKey: ['run-messages', runId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/runs/${runId}/messages`);
      if (!res.ok) throw new Error('messages');
      return res.json();
    },
    enabled: !!runId,
  });
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${API_BASE}/runs/${runId}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('cancel failed');
      return res.json() as Promise<AgentRun>;
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs', run.issueId] });
    },
  });
}
```

确认 `useUpdateIssue` 的 body 可传 `assignee`；`useAgents` 泛型为 `AgentSummary[]`（含 runtime）。将现有 `API` 常量统一为 `API_BASE`（或保留原名，全文一致即可）。

- [ ] **Step 2: `ws.ts` 扩展 DomainEvent 处理**

```typescript
import type { AgentRun, RunMessage, DomainEvent } from '@ma/shared';

// 在 onmessage 内追加：
if (
  event.type === 'run:queued' ||
  event.type === 'run:running' ||
  event.type === 'run:completed' ||
  event.type === 'run:failed' ||
  event.type === 'run:cancelled'
) {
  const run = event.run;
  qc.setQueryData<AgentRun[]>(['runs', run.issueId], (old) => {
    if (!old) return [run];
    const i = old.findIndex((r) => r.id === run.id);
    if (i >= 0) {
      const next = old.slice();
      next[i] = run;
      return next;
    }
    return [run, ...old];
  });
}

if (event.type === 'run:message') {
  const { message } = event;
  qc.setQueryData<RunMessage[]>(['run-messages', message.runId], (old) => {
    if (!old) return [message];
    if (old.some((m) => m.id === message.id)) return old;
    return [...old, message].sort((a, b) => a.seq - b.seq);
  });
}

// run:progress：可选
// useRunProgressStore.getState().setText(event.runId, event.text)
```

- [ ] **Step 3: commit**

```bash
git add app/packages/web/lib
git commit -m "feat(s03): web hooks + WS run events"
```

---

### Task 3.2: 详情指派 / 停止 / 轨迹

**Files:** Create `AssigneeSelect.tsx`, `RunStatusBar.tsx`, `RunTrace.tsx`；Modify `IssueHeader.tsx`, `IssueDetail.tsx`

- [ ] **Step 1: `AssigneeSelect.tsx`**

```tsx
'use client';
import { useAgents, useUpdateIssue } from '@/lib/api';

export function AssigneeSelect({ issueId, currentAgentId }: { issueId: string; currentAgentId: string | null }) {
  const { data: agents = [] } = useAgents();
  const update = useUpdateIssue();

  function onChange(value: string) {
    if (value === '') {
      if (!confirm('清除指派并停止当前运行？')) return;
      update.mutate({ id: issueId, input: { assignee: null } });
      return;
    }
    const ag = agents.find((a) => a.id === value);
    if (!ag) return;
    if (!confirm(`将用 ${ag.runtime} 启动 ${ag.name}，可随时停止。继续？`)) return;
    update.mutate({ id: issueId, input: { assignee: { type: 'agent', id: ag.id } } });
  }

  return (
    <select
      value={currentAgentId ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label="指派 agent"
    >
      <option value="">未指派</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {a.runtime}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: `RunStatusBar.tsx`**

```tsx
'use client';
import { useRuns, useCancelRun } from '@/lib/api';

export function RunStatusBar({ issueId }: { issueId: string }) {
  const { data: runs = [] } = useRuns(issueId);
  const cancel = useCancelRun();
  const active = runs.find((r) => r.status === 'queued' || r.status === 'running') ?? runs[0];
  if (!active) return <p className="run-status">指派 agent 后自动执行</p>;
  const canStop = active.status === 'queued' || active.status === 'running';
  return (
    <div className="run-status-bar">
      <span>
        运行 {active.status} · {active.runtime}
        {active.error ? ` · ${active.error}` : ''}
      </span>
      {canStop && (
        <button type="button" onClick={() => cancel.mutate(active.id)} disabled={cancel.isPending}>
          停止
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `RunTrace.tsx`**

```tsx
'use client';
import { useRuns, useRunMessages } from '@/lib/api';

export function RunTrace({ issueId }: { issueId: string }) {
  const { data: runs = [] } = useRuns(issueId);
  const runId = runs[0]?.id;
  const { data: messages = [] } = useRunMessages(runId);
  if (!runId) return null;
  return (
    <section className="run-trace">
      <h3>运行轨迹</h3>
      <ul>
        {messages.map((m) => (
          <li key={m.id} data-kind={m.kind}>
            <code>#{m.seq}</code> <strong>{m.kind}</strong> {m.body.slice(0, 500)}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: `IssueHeader` 挂 `AssigneeSelect`（传入 issue.id 与 assignee?.type==='agent' ? assignee.id : null）；`IssueDetail` 挂 `RunStatusBar` + `RunTrace`**

- [ ] **Step 5: commit**

```bash
git add app/packages/web/components
git commit -m "feat(s03): 详情指派/停止/运行轨迹"
```

---

### Task 3.3: /runtimes 双栏 + 导航

**Files:** Create `components/RuntimesPage.tsx`, `app/runtimes/page.tsx`；Modify `layout.tsx`, `globals.css`

- [ ] **Step 1: `RuntimesPage.tsx`**

```tsx
'use client';
import { useRuntimes } from '@/lib/api';

export function RuntimesPage() {
  const { data, refetch, isFetching } = useRuntimes();
  if (!data) return <div>加载中…</div>;
  const { machine, runtimes } = data;
  const installed = runtimes.filter((r) => r.installed).length;
  return (
    <div className="runtime-layout">
      <aside className="machine-list">
        <div className="machine-item active">
          <div className="machine-item-name">{machine.name}</div>
          <div className="machine-item-meta">{runtimes.length} 个运行时</div>
          <span className="machine-tag">本机</span>
        </div>
      </aside>
      <section className="runtime-detail">
        <header>
          <h1>
            <span className="status-dot-green" /> {machine.name} 在线
          </h1>
          <p>
            {installed} 已安装 · cwd={machine.cwd ?? '（未配置 MA_WORKSPACE_CWD）'}
          </p>
          <button type="button" onClick={() => refetch()} disabled={isFetching}>
            重新探测
          </button>
        </header>
        <table className="data-table">
          <thead>
            <tr>
              <th>运行时</th>
              <th>健康度</th>
              <th>智能体</th>
              <th>费用 - 7天</th>
              <th>CLI</th>
            </tr>
          </thead>
          <tbody>
            {runtimes.map((rt) => (
              <tr key={rt.id}>
                <td>{rt.label}</td>
                <td>{rt.installed ? '可用' : '未检测到'}</td>
                <td>{rt.agentIds.length ? `${rt.agentIds.length} 个` : '—'}</td>
                <td>—</td>
                <td>
                  <code>{rt.version ?? '—'}</code>
                  {rt.path ? <div><small>{rt.path}</small></div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: `app/runtimes/page.tsx`**

```tsx
import { RuntimesPage } from '@/components/RuntimesPage';
export default function Page() {
  return <RuntimesPage />;
}
```

- [ ] **Step 3: `layout.tsx` 顶栏导航（保留 Providers）**

```tsx
import Link from 'next/link';
// 在 body 内 children 上方：
<nav style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
  <Link href="/">看板</Link>
  {' · '}
  <Link href="/runtimes">运行时</Link>
</nav>
```

- [ ] **Step 4: globals.css 增加 `.runtime-layout` 双栏 flex（左约 240px，右 flex1）**

- [ ] **Step 5: typecheck**

```bash
cd D:/code/multi-agent/app
pnpm -r typecheck
```

- [ ] **Step 6: §12 浏览器验收**

- 工程 / 运行时页 / 执行三 CLI / 停止 / 回归  
- **FRI-11 改指派到 agent**（seed 为 squad）  
- 在 `app/packages/server` 或根 README 片段注明 `MA_WORKSPACE_CWD` 与三 CLI 登录  

- [ ] **Step 7: handoff + push**

```bash
# 写 app/.progress/s03-impl-3.md（§12 勾选 + 证据）
git add app/packages/web app/.progress/s03-impl-3.md
git commit -m "feat(s03): /runtimes 双栏 + 导航 + 验收 handoff"
git push -u origin feat/s03-runtime-backend
```

---

## Plan Self-Review（二次，2026-07-09）

### 1. Spec 覆盖

| Spec | Task |
|---|---|
| §3 数据模型 agent.runtime / agent_run / run_message | 1.3–1.4 |
| §4 shared 契约 + assignee + assignee | 1.2 |
| §5 API runs/runtimes/agents | 2.3 |
| §6 指派即跑 / Worker / cancel | 2.2–2.3 + run-service |
| §7 三 Backend + detect + R5 降级 | 2.1 spawn-line + 三文件 |
| §8 WS run:* | 2.2 publish + 3.1 消费 |
| §9 前端指派/轨迹/runtimes 双栏 | 3.2–3.3 |
| §12 验收三 CLI + FRI-11 提示 | 2.3 自测 + 3.3 Step 6 |
| 终止必做 | run-control + cancelRunById + UI 停止 |
| progress 不进 DB | Worker onEvent 仅 progress 事件 |
| 终态 agent comment | Worker completed 分支 |

### 2. Placeholder 扫描（已修）

| 问题 | 处置 |
|---|---|
| spawnCollect/parseClaude 仅注释 | → 完整 `spawn-line.ts` + 三 Backend 文件 |
| RunWorker 仅要点 | → 完整 `run-worker.ts` |
| runs.ts / enqueue 仅注释 | → 完整 `runs.ts` + `run-service.ts` |
| web hooks/组件仅注释 | → 完整 hooks + 组件代码块 |
| 错误引用 Task 3.4 | → 改为 3.3 Step 6 |

### 3. 类型一致性

| 名称 | 约定 |
|---|---|
| 表导出 | drizzle `agentRuns` / `runMessages`；SQL 表名 `agent_run` / `run_message` |
| API 类型 | `AgentRun` / `RunMessage` / `RuntimesResponse` / `RuntimeId` |
| WS | `run:queued|running|completed|failed|cancelled` + `run:progress` + `run:message` |
| queryKey | `['runs', issueId]` · `['run-messages', runId]` · `['runtimes']` |
| cancel | 仅 `POST /api/runs/:runId/cancel` |

### 4. 实现者注意（非占位）

- Windows 上 `fs.access(..., X_OK)` 可能对 `.exe` 行为怪异：`resolveCmd` 若 env 路径失败，依赖 `where`  
- drizzle `update.returning` 在 0.33 可能不可用：Worker claim 已写兼容路径  
- Cursor 默认 argv 可能需 spike 修改：**允许改 `cursor.ts` 参数，必须记 handoff**（非 TBD）

**结论：计划可执行；无阻塞性 TBD。**

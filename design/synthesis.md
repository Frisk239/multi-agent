# 综合分析：技术选型与架构决策

> 更新：2026-07-08 · 基于对 multica / hermes / pi 的源码深读（见 [../references/deep/](../references/deep/)）+ chanpin 原型验证（见 [../chanpin/ANALYSIS.md](../chanpin/ANALYSIS.md)）
> 配套：[architecture.md](architecture.md)（目标架构）、[roadmap.md](roadmap.md)（开发计划）

本文回答三个问题：

1. **Pi 是否适合做底层？**（§1）
2. **如何用 TypeScript 造出 multica-like 产品？**（§2）
3. **各参考项目分别借鉴什么？**（§3）

> **原型验证（2026-07-08）：** `chanpin/prototype/` 已有可交互的高保真原型（88 Must REQ），数据模型（seed.js）已直接映射生产 schema，信息架构已锁定。§2 的 TS 实现规格与原型完全对齐——**产品不确定性已清零，剩余全是工程实现**。详见 [chanpin/ANALYSIS.md](../chanpin/ANALYSIS.md)。

---

## §1 Pi 是否适合做底层？

### 结论：适合，但定位需修正 —— Pi 是「Backend 之一」，不是「唯一执行层」。

你的核心需求是**每个 agent 绑定本机的一个 CLI**（Claude Code / opencode / Cursor / Pi）。这意味着多 Backend 是第一天就要有的核心抽象（学 multica 的 `Backend` 接口），Pi 只是其中一个 backend —— 但它是**最特殊的一个**：原生 TS、进程内嵌入、零子进程开销，适合作为 Phase 0 验证闭环的首选 backend。

### 1.1 嵌入是 Pi 的一等设计目标

Pi README 自我定位就是 "Agent Harness"。它的 monorepo 结构里有专门为嵌入准备的包：

| 你需要的能力 | Pi 提供 | 文件 |
|---|---|---|
| 进程内嵌入 | `createAgentSession()` → 拿到 session，调 `prompt()` / `subscribe()` | `packages/coding-agent/src/core/sdk.ts:167` |
| 子进程嵌入（隔离） | spawn `pi --mode rpc`，stdin/stdout 讲 JSON-RPC | `packages/orchestrator/src/rpc-process.ts:25` |
| 多实例管理 | `OrchestratorSupervisor` 管理 N 个 pi 实例 | `packages/orchestrator/src/supervisor.ts:63` |
| 自定义工具注入 | `customTools: ToolDefinition[]` 选项 | `sdk.ts` options |
| 编码工具工厂 | `createBashTool` / `createReadTool` / `createEditTool` … | coding-agent exports |

**关键洞察：Pi 的 `packages/orchestrator` 本身就是一个迷你 multica。** 它 spawn 多个 `pi --mode rpc` 子进程，`OrchestratorSupervisor` 管理它们的生命周期、session、事件流。multica 做的是「管理多种异构 CLI」，Pi orchestrator 做的是「管理多个 Pi 实例」—— 架构骨架相同。

### 1.2 Pi 提供了你要自己造的一切执行层能力

对比 hermes 源码深读得出的「执行层必备能力」清单：

| 能力 | hermes 怎么做 | Pi 怎么做 | 你要不要自己造 |
|---|---|---|---|
| Agent loop | `conversation_loop.py` 5312 行 | `packages/agent/src/agent-loop.ts` | ❌ Pi 已提供 |
| Tool calling + 注册 | `tools/registry.py`（自注册 + dispatch-never-raises） | `ToolDefinition[]` + `customTools` | ❌ Pi 已提供 |
| 消息抽象（双层） | 没有，messages 直接给 LLM | `AgentMessage` / `Message` + `convertToLlm` | ❌ Pi 已提供，且**更好** |
| 事件流给 UI | 三通道 callback（stream_delta / reasoning / tool_gen） | 类型化 `AgentSessionEvent` + `subscribe()` | ❌ Pi 已提供 |
| Prompt cache 保护 | system prompt 一次构建 + 临时上下文进 user msg | 由 `convertToLlm` 边界保证 | ❌ Pi 已提供 |
| Session 持久化 | 自己实现 | `SessionManager` 注入 | ❌ Pi 已提供 |
| Compaction（长对话压缩） | `conversation_compression.py` | `session.compact()` + 自动触发 | ❌ Pi 已提供 |

**结论：执行层你几乎不需要自己造。** Pi 把 hermes 用 5312+3450 行做的事，用干净得多的 TS 抽象实现了。

### 1.3 Pi 缺什么（= 你要造的）

Pi 是**执行层**，它故意不做编排。这正是 multica 相对 hermes 的差异点，也是你的毕设空间：

| Pi 不做 | multica 怎么做 | 你的毕设要做 |
|---|---|---|
| 任务看板 / Issue CRUD | `issue` 表 + polymorphic assignee | ✅ 编排层 |
| 状态机（queued→running→done） | DB 行即锁 + 条件 UPDATE | ✅ 编排层 |
| 多 Agent 指派（human/agent/squad） | `(assignee_type, assignee_id)` | ✅ 编排层 |
| 实时进度广播 | EventBus → WebSocket → 浏览器 | ✅ 编排层 |
| 调度（cron/webhook/autopilot） | DB-backed scheduler + lease | ✅ 编排层 |
| 项目 Wiki | 无 | ✅ 知识层（你的创新点） |
| 跨会话记忆 | 无（Pi 是无状态执行器） | ✅ 记忆层（你的创新点） |

### 1.4 Pi 在你的架构中的定位

Pi 不是你的「唯一执行层」，而是你的**第一个 backend**（进程内 SDK 嵌入，Phase 0 验证闭环用）。其他 CLI（Claude Code / opencode / Cursor）是子进程 backend。所有 backend 统一在 `RuntimeBackend` 接口下。

| Backend | 驱动方式 | 隔离性 | Phase |
|---|---|---|---|
| Pi | 进程内 SDK（`createAgentSession`） | 无（同进程） | 0 |
| Claude Code | 子进程（`spawn claude --output-format stream-json`） | 强 | 1 |
| opencode | 子进程 | 强 | 1 |
| Cursor | TBD（调研 headless 能力） | 强 | 2+ |

**注意：** 你的纯本地架构里，子进程崩溃隔离已经足够 —— 不需要 Pi 的 RPC 模式（那是给多节点场景的）。Pi 进程内嵌入 + 其他 CLI 子进程，就是最简组合。

### 1.5 风险与对策

| 风险 | 严重度 | 对策 |
|---|---|---|
| Pi 仓库不稳定 / breaking change | 中 | fork 或 pin 版本；Pi 是 `@earendil-works` 私有 scope，关注其迭代 |
| Pi 的 Agent 设计不满足你的需求 | 低 | `convertToLlm` + `transformContext` 给了你足够的拦截点；实在不行可替换执行层 |
| 论文「执行层」创新点不足 | 中 | 你的创新在**编排+Wiki+Memory**三层，不在执行层；Pi 当执行层不影响论文叙事 |
| LangChain.js 与 Pi 的 LLM 层重叠 | 低 | Pi 有自己的 `packages/ai`（统一 streaming）；LangChain 可用于 Wiki/Memory 的 LLM 调用，不碰执行层的 LLM 调用 |

---

## §2 如何用 TypeScript 造 multica-like 产品？

### 2.1 目标架构（TS 全栈）

```
┌─────────────────────────────────────────────────────────┐
│  Next.js Web 控制台（看板 / Wiki 浏览器 / 记忆检索）      │
│  React Query (服务端) + Zustand (客户端) + WS 订阅       │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────┴──────────────────────────────────┐
│  Server (Node.js + Fastify/Hono)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ 编排层    │  │ 知识层    │  │ 记忆层    │  │ 调度器    │ │
│  │ Issue/   │  │ Wiki     │  │ Memory   │  │ Cron/    │ │
│  │ 状态机   │  │ ingest/  │  │ Provider │  │ Webhook  │ │
│  │ Squad    │  │ lint     │  │ ABC      │  │          │ │
│  └────┬─────┘  └──────────┘  └──────────┘  └──────────┘ │
│       │ RuntimeAdapter 接口                                 │
│  ┌────┴────────────────────────────────────────────────┐ │
│  │ PiAdapter（v1）: createAgentSession() 进程内嵌入      │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                       │
                PostgreSQL + pgvector
```

### 2.2 Monorepo 结构建议

```
app/
├── package.json                  pnpm workspace 根
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── server/                   Node.js 后端
│   │   ├── src/
│   │   │   ├── orchestration/     编排层（最大块）
│   │   │   │   ├── task-machine.ts   状态机（学 multica DB-row-as-lock）
│   │   │   │   ├── assignee.ts       多态指派 (type, id)
│   │   │   │   ├── squad.ts          组长路由 + briefing 注入
│   │   │   │   ├── event-bus.ts      进程内同步总线
│   │   │   │   └── ws-broadcaster.ts → WebSocket 桥
│   │   │   ├── runtime/           执行层 adapter
│   │   │   │   ├── adapter.ts       RuntimeAdapter 接口
│   │   │   │   └── pi-adapter.ts     Pi SDK 进程内嵌入
│   │   │   ├── wiki/              知识层
│   │   │   │   ├── ingest.ts
│   │   │   │   ├── lint.ts
│   │   │   │   └── graph.ts
│   │   │   ├── memory/            记忆层
│   │   │   │   ├── provider.ts      MemoryProvider 接口
│   │   │   │   └── pgvector.ts
│   │   │   ├── scheduler/         调度器（学 multica 通用调度器）
│   │   │   ├── db/                Drizzle ORM + 迁移
│   │   │   └── index.ts
│   │   └── package.json
│   ├── web/                      Next.js 前端
│   │   ├── app/
│   │   ├── components/
│   │   └── package.json
│   └── shared/                   共享类型 + Zod schema
│       ├── src/
│       │   ├── events.ts          WS 事件类型
│       │   ├── models.ts          Workspace/Issue/Agent schema
│       │   └── rpc.ts             API 契约
│       └── package.json
├── docker-compose.yml            PostgreSQL + pgvector
└── README.md
```

### 2.3 进程模型（基于 multica/hermes/pi 源码验证）

**方案 C 混合：编排主进程 + 每个 agent 执行一个子进程。**

基于三家源码的事实（不是猜测）：

| 平台 | 模型 | 为什么 |
|---|---|---|
| **multica** | 主进程(goroutine池) + 每任务一子进程 | agent 是外部 CLI 必须 spawn；主进程负责排队/限流/崩溃清理 |
| **pi orchestrator** | supervisor 主进程 + 每 agent 一子进程 | 明知有进程内选项仍选子进程——崩溃隔离、生命周期独立、监督重启 |
| **hermes** | 单进程 + 线程池 | agent 是自己进程内的 Python 对象，不 spawn 外部进程 |

**关键区别：** hermes 选单进程是因为它的 agent 是"自产自销"的进程内对象。**你的场景和 multica/pi 一样——agent 是外部 CLI**，本来就必须 spawn 子进程，所以是方案 C。

**你的实现：**
- **编排主进程**（Node 长驻）：HTTP/WebSocket 服务、agent 注册、任务派发、并发槽位（semaphore，3-5 个）、子进程崩溃处理、状态持久化。学 multica 的 `newTaskSlotSemaphore` + `go func(){handleTask}` 模式（换成 Node 的 async semaphore + 子进程池）。
- **每个 agent 任务 = 一个子进程**：spawn `claude --output-format stream-json` 等，stdin/stdout 管道读流（multica `pkg/agent/claude.go` 是最直接的参考实现，含 timeout 进程树 kill、stderr tail）。
- **崩溃恢复**（学 pi）：子进程意外退出 → `handleUnexpectedRpcExit` 清状态；主进程重启 → `recoverAfterRestart` 把残留 agent 标记 stopped。
- **不需要 hermes 的线程池模型**——你的 agent 不是进程内对象。

**相对 multica 的简化：** multica 是「云端 server + 本地 daemon」两个物理进程（因为执行在本地、API 在云端）。你纯本地，server 和 daemon 合并成一个 Node 主进程即可——Redis relay、多节点 broadcaster、唤醒 WebSocket 都不需要。EventBus 是主进程内同步调用，DB 用 SQLite。

### 2.4 关键技术选型（纯本地优先）

| 组件 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript 全栈 | 你熟悉；Pi 原生 TS；前后端共享类型 |
| Monorepo | pnpm workspace | 轻量；TS 友好 |
| 后端框架 | Hono 或 Fastify | Hono 更现代；Fastify 生态成熟。都比 Express 好 |
| ORM | Drizzle | sqlc 风格的类型安全；最接近 multica 的 sqlc 体验；迁移工具好 |
| DB | **SQLite**（Phase 0-2）→ PostgreSQL+pgvector（Phase 3 起需向量） | 纯本地零配置启动；任务表 SQLite 够；记忆层要向量再升 |
| 实时 | `ws`（WebSocket） | 纯本地，主进程内同步 EventBus，不需要 Redis relay |
| 前端 | Next.js (App Router) | multica / WeKnora 同路线 |
| 前端状态 | React Query + Zustand | multica 已验证的组合 |
| 执行层 | **多 Backend adapter**（非单一 runtime） | 每个 agent 绑定一个本机 CLI，见 §2.6 |
| LLM 调用（Wiki/Memory 用） | LangChain.js | 只用于非执行层；执行层各 CLI 自带 LLM 调用 |
| 校验 | Zod | 全栈共享 schema |

**全本地的简化红利：** multica 是「云端 server + 本地 daemon」双进程，所以它要 Redis relay、多节点 broadcaster、唤醒 WebSocket、`FOR UPDATE SKIP LOCKED` 跨进程公平。你纯本地（server+daemon 合一），这些都**不需要**：EventBus 是主进程内同步调用，DB 用 SQLite，运行时发现就是本机 `which`。复杂度降一个量级。

### 2.4 多态指派的 TS 实现（学 multica）

multica 用 `(assignee_type, assignee_id)` + CHECK 约束。TS + Drizzle 对应：

```typescript
// shared/src/models.ts
export const AssigneeType = z.enum(['member', 'agent', 'squad']);
export type AssigneeType = z.infer<typeof AssigneeType>;

export const Assignee = z.object({
  type: AssigneeType,
  id: z.string().uuid(),
});
```

```typescript
// server/src/db/schema.ts  (Drizzle)
import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';

export const issues = pgTable('issue', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  title: text('title').notNull(),
  status: text('status', { enum: ['backlog','ready','running','done','failed'] })
    .notNull().default('backlog'),
  assigneeType: text('assignee_type', { enum: ['member','agent','squad'] }),
  assigneeId: uuid('assignee_id'),
  // ...
}, (t) => ({
  assigneeIdx: index('idx_issue_assignee').on(t.assigneeType, t.assigneeId),
}));
```

### 2.5 状态机：DB 行即锁（学 multica）

multica 的核心模式 —— 条件 `UPDATE ... WHERE status IN (...) RETURNING *` —— 在 Drizzle 里：

```typescript
// server/src/orchestration/task-machine.ts
import { and, eq, inArray, sql } from 'drizzle-orm';

export async function claimTask(db, agentId: string) {
  const [claimed] = await db
    .update(agentTaskQueue)
    .set({
      status: 'dispatched',
      dispatchedAt: new Date(),
      prepareLeaseExpiresAt: sql`now() + interval '5 minutes'`,
    })
    .where(and(
      eq(agentTaskQueue.agentId, agentId),
      eq(agentTaskQueue.status, 'queued'),
      // 可加 NOT EXISTS 子查询保证 per-(agent,issue) 串行
    ))
    .returning();
  return claimed; // undefined = 没抢到
}
```

**注意：** `FOR UPDATE SKIP LOCKED` 在 Drizzle 里要用 `sql` 模板手写。Phase 0 单进程时可省略（单进程无竞争），Phase 1+ 多 worker 时再加。

### 2.6 执行层：多 Backend adapter（核心设计，非可选项）

**关键修正：** 之前倾向「Pi 当唯一执行层」是错的。你的核心体验是「每个 agent 绑定本机的一个 CLI（Claude Code / opencode / Cursor / Pi）」，所以多 Backend 是**第一天就要有的核心抽象**，不是后期可选项。这正是 multica 的 `pkg/agent/agent.go:16` Backend 接口的精髓。

```typescript
// server/src/runtime/backend.ts
export interface RuntimeBackend {
  readonly name: string;                    // "pi" | "claude-code" | "opencode" | "cursor"

  /** 本机是否装了这个 CLI（学 multica daemon LoadConfig 的探针） */
  detect(): Promise<boolean>;

  /** 驱动执行，归一化成事件流（学 multica Backend.Execute 返回 Session.Messages channel） */
  execute(
    input: ExecutionInput,
    onEvent: (event: AgentEvent) => void,
    signal?: AbortSignal,
  ): Promise<ExecutionResult>;
}

export interface ExecutionInput {
  prompt: string;
  cwd: string;
  workspaceId: string;
  issueId: string;
  agentInstructions?: string;        // 该 agent 的系统指令
  skills?: SkillRef[];               // 该 agent 绑定的 skill
  mcpServers?: McpServerConfig[];    // 该 agent 连接的 MCP server
  contextBlocks?: ContextBlock[];    // 注入：AGENTS.md / Wiki 页 / memory 召回
}

export type AgentEvent =
  | { type: 'message_start' }
  | { type: 'message_delta'; text: string }
  | { type: 'message_end' }
  | { type: 'tool_start'; name: string; args: unknown }
  | { type: 'tool_end'; name: string; result: string }
  | { type: 'turn_end' };

export interface ExecutionResult {
  finalText: string;
  exitReason: 'completed' | 'interrupted' | 'budget_exhausted' | 'failed';
  apiCalls: number;
  toolTrace: ToolCall[];
}
```

#### 各 Backend 实现路径

| Backend | 怎么驱动 | 怎么拿到事件流 | Phase |
|---|---|---|---|
| **MockBackend** | 不调 LLM，echo prompt | 直接 emit 假事件 | 0（先跑通编排） |
| **PiBackend** | `createAgentSession()` 进程内 SDK | `session.subscribe(evt => ...)` | 0-1 |
| **ClaudeCodeBackend** | spawn `claude --output-format stream-json` | 解析 stdout 的 stream-json NDJSON | 1 |
| **OpencodeBackend** | spawn `opencode` 子进程 | 解析其流式输出格式 | 1 |
| **CursorBackend** | 调研 headless 能力后定 | TBD | 2+ |

#### Pi backend 实现（进程内 SDK 嵌入）

```typescript
// server/src/runtime/pi-backend.ts
import { createAgentSession } from '@earendil-works/pi-coding-agent';

export class PiBackend implements RuntimeBackend {
  readonly name = 'pi';

  async detect() {
    // Pi 是进程内库，总是可用
    return true;
  }

  async execute(input, onEvent, signal) {
    const { session } = await createAgentSession({
      cwd: input.cwd,
      model: 'anthropic/claude-sonnet-4-20250514',
      // 把该 agent 的指令、skill、MCP 注入 Pi
      systemPrompt: input.agentInstructions,
      customTools: this.buildToolsFromSkills(input.skills),
      mcpServers: input.mcpServers,
    });

    // 桥接 Pi 的 AgentSessionEvent → 你的 AgentEvent
    session.subscribe((evt) => {
      if (evt.type === 'message_update') onEvent({ type: 'message_delta', text: evt.text });
      else if (evt.type === 'tool_execution_start') onEvent({ type: 'tool_start', name: evt.name, args: evt.input });
      else if (evt.type === 'tool_execution_end') onEvent({ type: 'tool_end', name: evt.name, result: evt.output });
      else if (evt.type === 'message_end') onEvent({ type: 'message_end' });
      else if (evt.type === 'turn_end') onEvent({ type: 'turn_end' });
    });

    const result = await session.prompt(input.prompt);
    return { finalText: result, exitReason: 'completed', apiCalls: 0, toolTrace: [] };
  }
}
```

#### Claude Code backend 实现（子进程驱动，学 multica daemon）

```typescript
// server/src/runtime/claude-code-backend.ts
import { spawn } from 'node:child_process';

export class ClaudeCodeBackend implements RuntimeBackend {
  readonly name = 'claude-code';

  async detect() {
    // 学 multica 的 LookPath + 登录 shell fallback
    try { await exec('which claude'); return true; } catch { return false; }
  }

  async execute(input, onEvent, signal) {
    const child = spawn('claude', [
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--include-partial-messages',
      // 该 agent 的指令、skill、MCP 通过 prompt 或 -p/--append-system-prompt 注入
    ], { cwd: input.cwd });

    // 解析 stdout 的 stream-json NDJSON → 归一化成 AgentEvent
    // （格式见 Claude Code 文档的 stream-json schema）
    const rl = readline.createInterface({ input: child.stdout });
    for await (const line of rl) {
      const evt = JSON.parse(line);
      // 映射 Claude 的事件类型 → 你的 AgentEvent ...
    }

    // 学 multica executeAndDrain：喂 stdin prompt，drain stdout 事件
    child.stdin.write(JSON.stringify({ prompt: input.prompt }) + '\n');
    // ...
  }
}
```

#### 运行时发现（学 multica daemon 的 `LoadConfig`）

```typescript
// server/src/runtime/discovery.ts
// 启动时探测本机装了哪些 CLI，暴露给前端「创建 agent 时选 runtime」
export async function discoverBackends(): Promise<RuntimeInfo[]> {
  const backends = [new PiBackend(), new ClaudeCodeBackend(), new OpencodeBackend()];
  const results = await Promise.all(
    backends.map(async (b) => ({ name: b.name, available: await b.detect() }))
  );
  return results;
}
```

### 2.7 Event Bus → WebSocket（学 multica 三跳）

```typescript
// server/src/orchestration/event-bus.ts
type Listener = (event: DomainEvent) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();

  on(type: string, fn: Listener) { /* ... */ }
  onAll(fn: Listener) { this.globalListeners.add(fn); }

  publish(event: DomainEvent) {
    // 同步派发（学 multica，非 async）—— 保证事件顺序
    this.listeners.get(event.type)?.forEach(fn => {
      try { fn(event); } catch (e) { console.error(e); }
    });
    this.globalListeners.forEach(fn => {
      try { fn(event); } catch (e) { console.error(e); }
    });
  }
}

// server/src/orchestration/ws-broadcaster.ts
// 纯本地：直接 Map<workspaceId, Set<WebSocket>>，不需要 Redis
// （multica 需要 Redis 是因为它多节点；你主进程内直接用 Map）
export interface Broadcaster {
  broadcastToWorkspace(workspaceId: string, data: unknown): void;
  sendToUser(userId: string, data: unknown): void;
}
```

### 2.8 开发节奏（对齐 roadmap，突出你的体验优先级）

你的优先级是：Squad ★★★★★ > Issue 时间线 ★★★★★ > 多运行时绑定 ★★★★ > Skill 导入 ★★★★ > MCP ★★★。开发节奏要保证 Squad 和 Issue 尽早可用。

**重要：`chanpin/prototype/` 已预完成 UI 设计。** 原型的信息架构、数据模型（seed.js）、设计 token 都可直接复用到生产。Phase 0-1 不用再设计 UI——按原型移植即可。

| Phase | 交付 | 重点（对应你的体验目标） | 参考 |
|---|---|---|---|
| **Phase 0** | Monorepo 脚手架 + DB schema（**照搬 seed.js 结构**）+ `MockBackend` + **从原型移植 Next.js UI** | 状态机跑通；Issue 基本结构；UI 用原型规格 | [chanpin/ANALYSIS.md](../chanpin/ANALYSIS.md) / §2.2 / §2.4 / §2.5 |
| **Phase 1a** | `PiBackend` + `ClaudeCodeBackend` 接入 + 运行时发现 + WebSocket 进度流 | **多运行时绑定**（agent 绑定本机 CLI） | §2.6 / [multica.md](../references/deep/multica.md) §5 |
| **Phase 1b** | **Squad 组长路由 + briefing 注入 + Issue 时间线** | **★★★★★ 小队** + **★★★★★ Issue 即任务中心** | [multica.md](../references/deep/multica.md) §2c §3 |
| **Phase 1c** | Skill URL 导入 + 按 agent 分配 + MCP 配置 | **★★★★ Skill 导入** + **★★★ MCP** | [hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §3 |
| **Phase 2** | Wiki ingest（编排事件驱动）+ Wiki 浏览器（**原型已有 5 页 mock**） | 创新点 | [wiki.md](../references/wiki.md) / [llm-wiki-pattern.md](../concepts/llm-wiki-pattern.md) |
| **Phase 3** | `MemoryProvider` + 向量 + 会话摘要入库 | 创新点 | [hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §1 |
| **Phase 4** | 端到端 demo（**FRI-11 路径**）+ 实验 + 答辩 | | roadmap.md |

---

## §3 各参考项目借鉴清单

### 按「抄什么」索引

| 你要造的 | 抄谁 | 抄什么 | 具体位置 |
|---|---|---|---|
| 任务状态机 | **multica** | DB 行即锁、条件 UPDATE、`FOR UPDATE SKIP LOCKED`、lease + sweeper | [deep/multica.md](../references/deep/multica.md) §2 |
| 多态指派 | **multica** | `(type, id)` 判别列 + CHECK 约束，不用 join table | [deep/multica.md](../references/deep/multica.md) §1 |
| WebSocket 实时 | **multica** | EventBus（同步）→ Broadcaster 接口 → WS；进度是 fire-and-forget 事件不进 DB | [deep/multica.md](../references/deep/multica.md) §2c |
| Squad 组长路由 | **multica** | leader 执行 + briefing 注入 + mention 闭环；不建独立 squad task 抽象 | [deep/multica.md](../references/deep/multica.md) §3 |
| 调度器 | **multica** | 通用 plan+claim+lease 调度器 + cron/webhook 作 hook；部分唯一索引做幂等 | [deep/multica.md](../references/deep/multica.md) §4 |
| Daemon 发现 | **multica** | LookPath + env 覆盖 + 登录 shell fallback；`task_available` WS 推送 + poll fallback | [deep/multica.md](../references/deep/multica.md) §5 |
| Runtime 抽象 | **multica** | `Backend { execute(): AsyncIterator<Message> }` 归一化所有 runtime | [deep/multica.md](../references/deep/multica.md) §5c |
| Agent 执行 | **Pi** | 直接用 SDK，不自造 loop | [deep/pi.md](../references/deep/pi.md) §5 |
| 消息双层抽象 | **Pi** | `AgentMessage` / `convertToLlm` —— 让 transcript 同时服务 UI 和 LLM | [deep/pi.md](../references/deep/pi.md) §2 |
| 事件流契约 | **Pi** | `AgentSessionEvent` 类型化事件 + `subscribe()` | [deep/pi.md](../references/deep/pi.md) §3 |
| 子进程编排 | **Pi** | `OrchestratorSupervisor` + `RpcProcessInstance`（多实例管理蓝图） | [deep/pi.md](../references/deep/pi.md) §5 策略 B |
| Tool Registry | **hermes** | 自注册 + `dispatch()` never raises + `check_fn` 可用性探针 | [deep/hermes-execution.md](../references/deep/hermes-execution.md) §2 |
| Prompt cache 保护 | **hermes** | system prompt 一次构建；临时上下文进 user 消息 | [deep/hermes-execution.md](../references/deep/hermes-execution.md) §3 |
| 循环终止契约 | **hermes** | 统一返回 `{final_response, exit_reason, completed, partial}` | [deep/hermes-execution.md](../references/deep/hermes-execution.md) §1 |
| MemoryProvider | **hermes** | ABC + orchestrator + 单 provider 约束 + 完整生命周期 hook 集 | [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §1 |
| 子 Agent 委派 | **hermes** | 隔离上下文 + 屏蔽 tool + 深度限制 + 摘要预算 + 父侧 memory hook | [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §2 |
| 扩展哲学 | **hermes** | Footprint Ladder（CLI+Skill > gated tool > plugin > MCP > core tool） | [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §3 |
| Wiki 工作流 | **openwiki / llm-wiki-agent** | ingest / query / lint / health；编译式 vs RAG | [wiki.md](../references/wiki.md) / [llm-wiki-pattern.md](../concepts/llm-wiki-pattern.md) |
| Memory 后端 | **mem0 / graphiti** | 向量 vs 时序图；Provider ABC | [memory-and-skills.md](../references/memory-and-skills.md) |
| AGENTS.md 契约 | **agents.md** | 可版本化的 agent 宪法；Wiki → AGENTS.md 桥梁 | [memory-and-skills.md](../references/memory-and-skills.md) |

### 按项目索引（一句话定位 + 借鉴优先级）

#### multica（★★★★★ 编排层主骨架）
- **定位：** 开源 Agent 托管平台，14+ CLI 变队友
- **抄：** 状态机、多态指派、WS 三跳、Squad、调度器、Daemon 发现、Backend 抽象
- **不抄：** Go 特定语法、它累积的边界 case 列（从六状态起步）
- 详见 [deep/multica.md](../references/deep/multica.md)

#### Pi（★★★★★ 执行层 = 你的 runtime）
- **定位：** 可嵌入 TS Agent Harness
- **抄：** 直接用 SDK 当执行层；学 `AgentMessage`/`convertToLlm` 双层；学 `AgentSessionEvent` 契约；学 orchestrator 多实例管理
- **不抄：** 它的 TUI（你有自己的 Next.js UI）
- 详见 [deep/pi.md](../references/deep/pi.md)

#### hermes-agent（★★★★★ 执行层 + 记忆 + 扩展的设计导师）
- **定位：** 全功能 Agent 运行时
- **抄：** Tool Registry 设计、prompt cache 保护规则、循环终止契约、MemoryProvider ABC + 生命周期 hook 集、delegate 子 agent 隔离模式、Footprint Ladder 哲学
- **不抄：** 5312 行循环本身（Pi 已提供）、provider 多路复用机器、async 桥接（TS async-native）
- **注意：** 它是 Python，你是 TS —— 抄**形状和模式**，不抄代码
- 详见 [deep/hermes-execution.md](../references/deep/hermes-execution.md) + [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md)

#### WeKnora（★★★★ 知识层产品化参考）
- **定位：** RAG + Agent + Auto-Wiki
- **抄：** ingest 队列 + DLQ、Wiki 层级 + 知识图、CLI Agent-first 契约（JSON envelope、exit code、NDJSON）
- 详见 [wiki.md](../references/wiki.md)

#### openwiki（★★★★ 仓库级 Wiki CLI）
- **定位：** LangChain 驱动的仓库文档工具
- **抄：** Git diff/log 作 evidence、SHA256 snapshot 防无变化 CI 更新、输出 + AGENTS.md 注入
- 详见 [wiki.md](../references/wiki.md)

#### llm-wiki-agent（★★★★ Wiki workflow 模板）
- **定位：** Agent 维护的领域 Wiki
- **抄：** `ingest` / `query` / `health`（零 LLM）/ `lint`（语义）四操作
- 详见 [wiki.md](../references/wiki.md) + [concepts/llm-wiki-pattern.md](../concepts/llm-wiki-pattern.md)

#### mem0（★★★★ 记忆后端 v1）
- **定位：** 向量记忆层
- **抄：** 五类 Provider ABC（LLM/Embedding/Vector/Graph/Reranker）、scope 模型、MCP 工具集
- **注意：** 有 TS 版本可直接用
- 详见 [memory-and-skills.md](../references/memory-and-skills.md)

#### graphiti（★★★★ 记忆后端可选）
- **定位：** 时序上下文图
- **抄：** 双时态 + 事实失效、Episode 溯源、混合检索
- **适合：** 关系演化、决策时间线（Phase 3+ 可选实验）
- 详见 [memory-and-skills.md](../references/memory-and-skills.md)

#### gstack（★★★ 方法论 Skill 库参考）
- **定位：** 工程 Skill 库
- **抄：** plan→review→QA→ship 角色 Skill 模式
- **注意：** 不是 runtime，是内置 skill pack 的参考

#### agents.md（★★★★ AGENTS.md 规范）
- **定位：** 项目宪法规范
- **抄：** 每个 workspace 自动生成/维护 AGENTS.md，作 Wiki → runtime 的桥梁
- 详见 [memory-and-skills.md](../references/memory-and-skills.md)

#### OpenDeepWiki / deepwiki-open（★★/★★ MVP 范围参考）
- **定位：** 企业/轻量 repo→wiki
- **抄：** 分阶段流水线（OpenDeepWiki）、MVP 范围界定（deepwiki-open）

---

## §4 工程模块实现指南

> 这是 §3 的「工程实现视角」——按你要造的**模块**组织，每个模块写清：抄谁、抄什么、哪个 Phase、抄到什么程度。
> 动手实现任何一个模块时，先读这一节对应行，再跳到深读文档的 file:line。

### 全景矩阵

| 工程模块 | 主抄（源码级） | 辅抄（设计/工作流） | Phase | 抄到什么程度 |
|---|---|---|---|---|
| **编排层** | | | | |
| Issue + 状态机 | multica | — | 0-1 | DB 行即锁；六状态起步，不加边界 case 列 |
| 多态指派 | multica | chanpin seed.js | 0 | `(type,id)` 判别列；照搬原型字段 |
| Squad 组长路由 | multica | — | 1b | leader 执行 + briefing 注入 + mention 闭环 |
| 调度器（cron/webhook） | multica | — | 2+ | 通用 plan+claim+lease；初期可只做 cron |
| Daemon 运行时发现 | multica | — | 1a | LookPath + env 覆盖；登录 shell fallback 后加 |
| 事件总线 + WebSocket | multica | — | 0-1 | 同步 EventBus + 主进程内 Broadcaster（无 Redis） |
| **执行层** | | | | |
| Agent loop | Pi（白嫖） | hermes（cache 规则） | 0 | 不自造；Pi 进程内 SDK 直接用 |
| Backend 抽象 | multica + Pi | — | 1a | `RuntimeBackend` 接口；Pi + Claude Code 两个实现 |
| Tool Registry | hermes | — | 仅自研 loop 时 | dispatch-never-raises + check_fn |
| 消息双层抽象 | Pi | — | 0 | `AgentMessage`/`convertToLlm` —— Pi 已提供 |
| 事件流契约 | Pi | — | 0 | `AgentSessionEvent` + `subscribe()` |
| **知识层（创新点）** | | | | |
| Wiki ingest 管线 | openwiki | OpenDeepWiki | 2 | Git diff 作 evidence + 分阶段流水线 |
| ingest/query/lint/health | llm-wiki-agent | — | 2 | 四操作工作流模板 |
| 产品化模块边界 | WeKnora | — | 2 | ingest 队列 + DLQ + CLI 契约 |
| MVP 范围界定 | deepwiki-open | — | 2 | 先做到 repo→wiki 最小可用 |
| 编译式 Wiki 理论 | concepts/ | — | 论文 | Karpathy 模式；实验对比对象 |
| **记忆层** | | | | |
| MemoryProvider 抽象 | hermes | — | 3 | ABC + 生命周期 hook 集 + 单 provider 约束 |
| 向量后端 v1 | mem0（TS 版） | — | 3 | 直接用 SDK；scope 模型照搬 |
| 时序图后端（可选实验） | graphiti | — | 3 | 双时态 + Episode 溯源；ablation 实验用 |
| brain-first 使用模式 | GBrains | — | 3 | 搜→用→写回协议 + ambient capture |
| **Skill 层** | | | | |
| Skill URL 导入 | multica | — | 1c | 照搬原型 skill 数据结构 |
| skill pack 内容 | gstack | — | 3 | plan/review/QA/ship 角色 skill 参考 |
| 扩展哲学 | hermes | — | 架构决策 | Footprint Ladder：CLI+Skill > tool > plugin > MCP |
| **契约层** | | | | |
| AGENTS.md 规范 | agents.md | — | 全程 | Wiki → AGENTS.md → runtime 启动加载 |

> **没有任何一个参考项目是白找的。** 每个都在某个模块有明确位置。

### 编排层详细指引

#### Issue + 状态机（Phase 0-1）

- **抄 multica：** `UPDATE ... WHERE status IN (...) RETURNING *` 条件更新作状态机守卫；lease 列（`dispatched_at`、`prepare_lease_expires_at`）+ 后台 sweeper 做崩溃恢复
- **抄到什么程度：** 六状态起步（`queued → dispatched → running → completed | failed | cancelled`）。multica 累积的 `wait_reason`、`force_fresh_session`、`head_sha` 去重等边界列**先不加**，按需补
- **简化：** 纯本地无跨进程竞争（主进程是唯一的 DB 写入者），`FOR UPDATE SKIP LOCKED` 可省（Phase 0）；Phase 1+ 若要并发 worker 再加
- **深读：** [deep/multica.md](../references/deep/multica.md) §2
- **数据真源：** [chanpin/prototype/data/seed.js](../chanpin/prototype/data/seed.js) 的 `issues[]`（status: planning|todo|in_progress|in_review|done）

#### 多态指派（Phase 0）

- **抄 multica：** `(assigneeType, assigneeId)` 判别列 + CHECK 约束，不建 join table
- **数据真源：** seed.js 的 `issue.assignee: { type: "squad"|"agent"|null, id }` 已是这个结构
- **深读：** [deep/multica.md](../references/deep/multica.md) §1

#### Squad 组长路由（Phase 1b）★★★★★

- **抄 multica 三段式 briefing：** ① Operating Protocol（常量，告诉 leader「用 @mention 委派，别自己干」）② Roster（成员渲染成 `[@Name](mention://agent/<id>)`）③ Mission Directive（用户自定义指令）
- **关键机制：** Squad 永远由恰好一个 leader agent 执行；不建独立 squad task 抽象；leader 的 comment mention 一个 worker → comment-trigger → 在 worker 队列排任务
- **数据真源：** seed.js 的 `squads[]`（`leaderId` + `memberIds` + `operatingProtocol` + `missionDirective`）
- **深读：** [deep/multica.md](../references/deep/multica.md) §3

#### 调度器（Phase 2+）

- **抄 multica：** 通用「plan + claim + lease + heartbeat + terminal write」调度原语，键 `(job, scope, plan_time)` 加唯一约束；cron 表达为产出 plan_times 的 hook；webhook/manual 绕过 planner 但复用分发核心
- **简化：** 初期可只做 cron（单机 crontab 式），webhook 留后期
- **深读：** [deep/multica.md](../references/deep/multica.md) §4

#### 事件总线 + WebSocket（Phase 0-1）

- **抄 multica 三跳：** Service 发 `events.Event` → 同步 EventBus → Broadcaster → WebSocket
- **简化：** 纯本地 Broadcaster 就是 `Map<workspaceId, Set<WebSocket>>`，**不需要 Redis**（multica 需要 Redis 是因为它多节点）
- **深读：** [deep/multica.md](../references/deep/multica.md) §2c

### 执行层详细指引

#### Agent loop（Phase 0）

- **不抄，用 Pi：** `createAgentSession()` 进程内嵌入。Pi 已提供 hermes 用 5312+3450 行做的事（loop、tool calling、消息双层、事件流、prompt cache 保护、compaction）
- **辅抄 hermes（仅理解原理）：** system prompt 一次构建 + 临时上下文进 user 消息（保 cache）；循环终止统一返回 `{final_response, exit_reason, completed, partial}`
- **深读：** [deep/pi.md](../references/deep/pi.md) §5 / [deep/hermes-execution.md](../references/deep/hermes-execution.md) §1 §3

#### Backend 抽象（Phase 1a）★★★★

- **抄 multica + Pi：** `RuntimeBackend { name, detect(), execute() }` 接口（学 multica `pkg/agent/agent.go:16`）；归一化所有 runtime 成流式事件
- **实现优先级：** MockBackend（Phase 0）→ PiBackend（进程内 SDK）→ ClaudeCodeBackend（spawn `claude --output-format stream-json`）→ OpencodeBackend
- **深读：** [deep/multica.md](../references/deep/multica.md) §5c / [deep/pi.md](../references/deep/pi.md) §5

#### 运行时发现（Phase 1a）

- **抄 multica daemon：** `which`/`LookPath` 探测本机 CLI + env 覆盖（`MULTICA_<NAME>_PATH` 式）+ 登录 shell fallback（救 fnm/nvm 装的 CLI）
- **简化：** 纯本地只有一台机器，不需要 multica 的 daemon 注册协议；启动时探测一次 + 提供「重新扫描」按钮即可
- **深读：** [deep/multica.md](../references/deep/multica.md) §5

### 知识层详细指引（你的创新点）★★★★★

> 这一层是你的论文核心。前面的 multica/Pi/hermes 是在打基础，**知识层才是你的差异化**。

#### Wiki ingest 管线（Phase 2）

- **主抄 openwiki（TS + LangChain，和你的栈一致）：**
  - Git diff/log 作 evidence —— ingest 时引用具体 commit，可追溯
  - SHA256 snapshot 防无变化 CI 更新 —— 避免重复 ingest
  - 输出 `openwiki/` 目录 + 注入 AGENTS.md
- **辅抄 OpenDeepWiki：** catalog/content 模型分离 + Worker 分阶段流水线（先建目录再填内容）
- **深读：** [wiki.md](../references/wiki.md) 的 openwiki/OpenDeepWiki 节

#### ingest/query/lint/health 四操作（Phase 2）

- **抄 llm-wiki-agent 的工作流：**
  - `ingest`：新源（Issue/PR/commit）→ 读 → 抽取 → 更新 entity/concept 页 → 更新 index → append log
  - `query`：读 index → 找相关页 → 合成答案 + 引用
  - `health`（零 LLM）：查孤儿页、断链、缺失概念页
  - `lint`（语义）：查矛盾、过期声明、缺交叉引用
- **理论：** [concepts/llm-wiki-pattern.md](../concepts/llm-wiki-pattern.md)（Karpathy 编译式 Wiki）

#### 产品化模块边界（Phase 2）

- **抄 WeKnora：** ingest 队列 + DLQ（失败重试）；Wiki 层级 + 知识图；CLI Agent-first 契约（JSON envelope、exit code、NDJSON）
- **深读：** [wiki.md](../references/wiki.md) 的 WeKnora 节

#### MVP 范围界定（Phase 2 起点）

- **参考 deepwiki-open：** 它是「最小 repo→wiki」，你 Phase 2 先做到它的程度（repo → 几个 Wiki 页），再加 openwiki 的 Git 联动和 llm-wiki-agent 的 lint

#### 编译式 Wiki 理论（论文）

- **核心论点（来自 concepts/）：** 知识 ingest 时编译进互链 Markdown，而非每次 query 重扫 raw。Wiki 是「持久、复利」的产物
- **实验设计：** 编译式 Wiki vs 朴素 RAG 的对比（你 roadmap 里的 ablation）—— 这批 Wiki 项目就是你的**实验对比对象**

### 记忆层详细指引

#### MemoryProvider 抽象（Phase 3）

- **抄 hermes 的 ABC + orchestrator：**
  - `MemoryProvider` interface：`initialize` / `prefetch` / `queue_prefetch` / `sync_turn` / `on_turn_start` / `on_session_switch` / `on_pre_compress` / `on_delegation` / `on_memory_write`
  - `MemoryManager`：强制「builtin 总在 + 至多一个外部 provider」；后台单 worker 串行化（保证 turn N 先于 turn N+1）
  - 上下文围栏 `<memory-context>` —— 让模型当它参考数据而非新输入
- **深读：** [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §1

#### 向量后端 v1（Phase 3）

- **用 mem0（有 TS 版）：** 直接用它的 TS SDK 作 `MemoryProvider` 的第一个实现。五类 Provider ABC（LLM/Embedding/Vector/Graph/Reranker）+ scope 模型（user/session/agent/run）照搬
- **深读：** [memory-and-skills.md](../references/memory-and-skills.md)

#### 时序图后端 —— 可选实验（Phase 3）

- **用 graphiti 做 ablation 实验：** mem0 是向量检索，graphiti 是时序图（双时态 + 事实失效 + Episode 溯源 + 混合检索）。论文做「向量 vs 图」对比就是创新点之一
- **定位：** 不是必须实现，是**可选的论文实验**

#### brain-first 使用模式（Phase 3）

- **抄 GBrains 的协议（不是技术）：**
  - **brain-first lookup：** agent 回答前先搜记忆，搜到就用，搜不到再问人
  - **ambient capture：** 边工作边自动存决策（你的编排事件 → 自动写记忆）
  - **cite：** 从记忆回答时，引用用了哪个 page
- **不抄：** 跨机器 MCP 连接、远程 token、PGLite 内嵌引擎（纯本地用不上）
- **笔记真源：** [references/notes-connect-coding-agent.md](../references/notes-connect-coding-agent.md)

### Skill 层详细指引

#### Skill URL 导入（Phase 1c）★★★★

- **抄 multica：** skill 从 URL 导入 + 按需分配给 agent
- **数据真源：** seed.js 的 `skills[]`（`url` + `usedBy` + `addedBy`）已是这个结构
- **实现：** Phase 1c 先做 URL → 拉取内容 → 存储；真实 GitHub API 拉取是 Phase 1c 后期

#### skill pack 内容参考（Phase 3）

- **参考 gstack：** 它的 23 个角色 skill（plan/review/QA/ship）是你平台预置 skill pack 的内容参考。你的 Skill 系统做好后，可参考它的 skill 内容预置几个工程类 skill
- **定位：** 不是 runtime，是**内置 skill pack 的内容来源**

#### Footprint Ladder 扩展哲学（架构决策）

- **抄 hermes 的决策框架：** 新能力优先选最高（最小足迹）阶：扩展现有代码 > CLI+Skill > service-gated tool > 插件 > MCP server > 新核心 tool
- **元规则：** 当 3+ PR 试图集成同类别东西时，抽象成 ABC + orchestrator
- **深读：** [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §3

### 契约层详细指引

#### AGENTS.md 规范（全程）

- **用 agents.md 规范：** 每个 workspace 自动生成/维护 AGENTS.md，作 **Wiki → runtime 的桥梁**：Wiki ingest 后更新 AGENTS.md，runtime 启动时加载它
- **你的这个工作区的 AGENTS.md**（就是本项目根那份）是这套机制的第一个实例

---

## 一句话总结

**你的毕设 = multica 的编排骨架（TS 重写，纯本地混合进程）+ 多 Backend 驱动本机 CLI（Pi 进程内 + Claude Code/opencode 子进程）+ hermes 的记忆/扩展设计（模式搬运）+ 编译式 Wiki（你的创新点）。**

论文叙事不变：「四层架构，编译式 Wiki + 可插拔记忆解决 RAG 不累积、执行不可追踪、跨会话上下文丢失」。全本地让你避开 multica 的分布式复杂度（Redis/多节点/唤醒 WS），把精力集中在你的体验优先级上：**Squad 小队、Issue 时间线、多运行时绑定、Skill 导入**。

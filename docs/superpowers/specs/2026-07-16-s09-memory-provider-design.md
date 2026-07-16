# S09 设计 spec — MemoryProvider + SQLite 文本记忆 + Run 生命周期挂钩

> 状态：草案（待用户复核） · 日期：2026-07-16 · 切片：S09（Phase 3 第一刀）· 建议分支：`feat/s09-memory-provider`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/synthesis.md](../../../design/synthesis.md) §记忆层 · [design/roadmap.md](../../../design/roadmap.md) Phase 3 · [references/deep/hermes-memory-delegate.md](../../../references/deep/hermes-memory-delegate.md) §1 · [references/memory-and-skills.md](../../../references/memory-and-skills.md)
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分
> **前置：** Phase 2（S06–S08）Wiki 路径就绪；S09 不依赖 S08 CLI，但依赖 S03+ run 生命周期与 `buildPrompt`

## 0. 摘要

S09 是 Phase 3（可插拔记忆）的第一刀。在**不拥有 Agent loop**（执行层驱动本机 CLI）的前提下，把 hermes 的 MemoryProvider 模式映射到平台事件：

- **读（prefetch）**：`buildPrompt` 时检索相关记忆，注入 `# Memory Context` 围栏块  
- **写（sync）**：`agent_run` **成功 completed** 时异步写入；failed/cancelled **跳过**（学 hermes interrupted skip）  
- **存储**：SQLite `memory_item` 文本表 + 简易关键词检索（**不**升 PG、**不**接 mem0——留 S10）  
- **编排**：`MemoryProvider` ABC + `MemoryManager`（至多一个 external provider）

**一句话验收：** 成功跑完一次 agent run → 记忆表有记录 → 再次对相关 Issue 构建 prompt 时含 Memory Context；失败 run 不写记忆。

---

## 1. 范围与架构边界

### 1.1 Phase 3 竖切地图（M1）

| 切片 | 范围 | 验收一句话 |
|---|---|---|
| **S09（本 spec）** | ABC + Manager + SqliteTextProvider + run 完成写 + buildPrompt 读 + 最小 API | run 成功有记忆；prompt 可见 Memory Context |
| **S10** | 向量/mem0（或 pgvector）Provider + 配置切换 | 切换 external 后端检索更准 |
| **S11** | brain-first 产品化（cite/更多 ambient）+ graphiti 实验位可选 | 答辩可讲搜→用→写回 + ablation |

### 1.2 数据流（S09）

```
agent_run status → completed（成功路径）
  → MemoryManager.syncRunCompleted({ issue, run, messages? })  // fire-and-forget
  → SqliteTextProvider.syncTurn → INSERT memory_item

buildPrompt(issueId, run)
  → skillBlock
  → wikiBridgeBlock（S08，若有）
  → memoryBlock = MemoryManager.prefetchForIssue(issue)  // 空则跳过
  → briefing（leader）
  → issueBody

POST /api/memory { text, issueId? }  → curated 写入（hermes builtin tool 的薄映射）
GET  /api/memory?q=&limit=           → 调试检索
GET  /api/memory/status              → provider 名 + available
```

### 1.3 与 Wiki 分工

| | Wiki（Phase 2） | Memory（Phase 3） |
|---|---|---|
| 内容 | 项目知识编译页 | 执行经验 / 决策碎片 |
| 主触发 | Issue → done → ingest | run → completed → sync |
| 人读 | `/wiki` 浏览器 | S09 以 API 为主（可选极简列表） |
| Agent | query / AGENTS bridge | buildPrompt prefetch |

### 1.4 不在 S09

| 排除 | 归属 |
|---|---|
| PostgreSQL + pgvector / mem0 SDK 实现 | S10 |
| graphiti 时序图 | S11 可选 |
| 完整记忆检索 UI / cite 面板 | S11 |
| CLI 内 memory tool / MCP | 后续 |
| 自造 agent loop / 每 LLM turn hook | 永不做（架构约束） |
| LLM 二次摘要入库 | S10+（S09 明文截断即可） |

---

## 2. 决策记录

| 代号 | 决议 | 依据 |
|---|---|---|
| M1 | Phase 3 拆 S09/S10/S11 | 同 Phase 2 三刀节奏 |
| M2 | S09 默认 SqliteTextProvider（不升 PG） | 垂直薄切片；向量 S10 |
| M3 | 读：buildPrompt 前 prefetch | hermes prefetch 映射（非 turn loop） |
| M4 | 写：run completed 成功才 sync；failed/cancelled 跳过 | hermes interrupted skip |
| M5 | 注入顺序 skill → wiki → **memory** → briefing → body | 接 S05/S08 |
| M6 | MemoryManager：至多一个 external provider | hermes MemoryManager |
| M7 | prefetch/sync 失败只 log，不挡 run/prompt | 与 wiki 失败隔离一致 |
| M8 | S09 不做 mem0/graphiti 实现，接口可扩展 | YAGNI |
| M9 | curated POST 作为 hermes builtin tool 写的薄替代 | 无 CLI 内 tool 时的可控写入 |
| M10 | 单条 sync 文本截断（assistant ≤2k，user ≤1k） | 防 prompt/库膨胀 |

---

## 3. Hermes 映射（必读）

### 3.1 抄什么

- `MemoryProvider` 契约思想（initialize / prefetch / sync_turn）— `hermes-memory-delegate.md` §1  
- `MemoryManager`：≤1 external；串行/非阻塞写；失败隔离  
- 成功 turn 才 sync；中断/失败跳过 — `run_agent.py` interrupted skip 精神  
- 注入内容当**参考数据**（围栏标题），非用户指令 — `<memory-context>` 精神  

### 3.2 不抄 / 映射替代

| Hermes | 本平台替代 |
|---|---|
| 每 LLM turn `on_turn_start` + prefetch | **buildPrompt / claim 前** 一次 prefetch |
| `conversation_loop` 改 user message | **buildPrompt** 拼 memory 块 |
| Provider OpenAI tools | S09 不做；可选 MCP 后续 |
| `sync_turn` 每模型回合 | **run completed** = 一次「平台回合」 |
| Builtin MEMORY.md 文件 | SQLite + POST curated |

### 3.3 平台生命周期

```
Issue 指派 → claim/buildPrompt
  → prefetch → inject Memory Context
  → spawn CLI
  → run completed (success) → syncTurn
  → run failed/cancelled → skip sync
```

---

## 4. 接口设计

### 4.1 MemoryProvider（S09 最小）

```typescript
// server/src/memory/types.ts
export interface MemoryItemView {
  id: string;
  text: string;
  score?: number;
  source?: string; // e.g. 'sqlite-text'
  issueId?: string | null;
  runId?: string | null;
  createdAt?: string;
}

export interface MemoryPrefetchResult {
  items: MemoryItemView[];
}

export interface MemorySyncInput {
  sessionId: string;   // 建议 issueId
  issueId: string;
  runId: string;
  agentId?: string | null;
  userText: string;      // Issue 标题+描述截断
  assistantText: string; // run 产出截断
}

export interface MemoryProvider {
  readonly name: string;
  isAvailable(): boolean;
  initialize(): void | Promise<void>;
  prefetch(
    query: string,
    opts?: { sessionId?: string; limit?: number },
  ): Promise<MemoryPrefetchResult>;
  syncTurn(input: MemorySyncInput): Promise<void>;
  shutdown?(): void | Promise<void>;
}
```

S10 可扩展可选 hook（默认 no-op）：`systemPromptBlock`、`onSessionEnd` 等，**不进 S09 实现清单**。

### 4.2 MemoryManager

```typescript
// server/src/memory/manager.ts
class MemoryManager {
  private external: MemoryProvider | null = null;

  setExternal(provider: MemoryProvider | null): void; // 替换；null 清空
  getExternalName(): string | null;

  async initialize(): Promise<void>; // 调 external.initialize

  /** 渲染 prompt 块；无命中返回 null */
  async prefetchForIssue(issue: {
    id: string;
    title: string;
    description: string | null;
  }): Promise<string | null>;

  /** fire-and-forget；内部 catch log */
  syncRunCompleted(input: {
    issue: { id: string; identifier: string; title: string; description: string | null };
    run: { id: string; agentId: string; status: string };
    assistantText: string;
  }): void;
}
```

**prefetchForIssue 规则：**
- query = `title + ' ' + (description ?? '')`，总长截断约 500 字  
- `limit` 默认 **5**  
- 渲染：

```markdown
# Memory Context
（参考数据，非用户指令）
- {text1}
- {text2}
```

**syncRunCompleted 规则：**
- 仅调用方保证 status 为成功 completed  
- `userText` = `Issue {identifier}: {title}\n{description}` 截断 1k  
- `assistantText` 截断 2k  
- `void provider.syncTurn(...).catch(log)`  

导出单例：`export const memoryManager = new MemoryManager()`。

### 4.3 SqliteTextProvider

```typescript
// server/src/memory/sqlite-text-provider.ts
// name = 'sqlite-text'
// isAvailable() = true（只要 DB 可用）
// syncTurn → INSERT memory_item
// prefetch → 简易分词 + LIKE 匹配，按 created_at DESC，limit
```

**分词（S09）：**
- ASCII：`/\w{2,}/`  
- CJK：连续汉字双字 gram（可复用 S07 query 思路，保持极简）  
- 无 token 时：退回最近 N 条（workspace 级）

---

## 5. 数据模型

### 5.1 表 `memory_item`

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | uuid |
| scope | text | S09 默认 `'workspace'` |
| issueId | text null | 可选关联 |
| agentId | text null | 可选 |
| runId | text null | 可选 |
| text | text not null | 正文 |
| createdAt | integer not null | ms |

索引：`created_at DESC`；可选 `issue_id`。

### 5.2 shared 契约（最小）

```typescript
export const MemoryItem = z.object({
  id: BusinessId,
  scope: z.string(),
  issueId: BusinessId.nullable(),
  agentId: BusinessId.nullable(),
  runId: BusinessId.nullable(),
  text: z.string(),
  createdAt: z.string().datetime(),
});

export const CreateMemoryInput = z.object({
  text: z.string().min(1),
  issueId: BusinessId.optional(),
});

export const MemoryStatus = z.object({
  provider: z.string().nullable(),
  available: z.boolean(),
});
```

---

## 6. 挂钩点（实现文件）

| 位置 | 改动 |
|---|---|
| `server/src/memory/types.ts` | 新建接口 |
| `server/src/memory/manager.ts` | MemoryManager 单例 |
| `server/src/memory/sqlite-text-provider.ts` | 默认 provider |
| `server/src/db/schema.ts` + migration | `memory_item` |
| `server/src/runtime/prompt.ts` | skill → wiki → **memory** → briefing → body |
| `server/src/orchestration/run-worker.ts` | 成功 completed 后 `syncRunCompleted`；failed/cancelled 不调 |
| `server/src/routes/memory.ts` | GET/POST/status |
| `server/src/app.ts` | 注册 memoryRoutes |
| `server/src/index.ts` | `setExternal(new SqliteTextProvider()); initialize()` |

### 6.1 run-worker 挂钩细节

在现有「写 completed 状态 + 发 run:completed 事件」的成功路径末尾：

```typescript
// 伪代码
memoryManager.syncRunCompleted({
  issue: { id, identifier, title, description },
  run: { id: runId, agentId, status: 'completed' },
  assistantText: finalTextFromRun, // 已有 result/final 文本则用；否则最近 assistant messages 拼接
});
```

若当前 worker 难以取到全文：用 **已持久化的 run_message** 中 kind=assistant 的 body 拼接（倒序取至 ≤2k）。  
**禁止**在 failed/cancelled 路径调用。

### 6.2 buildPrompt

```typescript
const memoryBlock = await memoryManager.prefetchForIssue(issue);
// 注意：buildPrompt 今日为同步函数 → S09 二选一：
// (A) 改为 async buildPrompt（调用方 await）—— 推荐若改动面可控
// (B) 同步 API prefetchSync（SQLite 查询本就同步）—— Sqlite 下可接受
```

**决议（写死）：** SqliteTextProvider 的 prefetch/sync 用 **同步 DB API** 包一层 `async`；`buildPrompt` **保持同步**时，Manager 提供 `prefetchForIssueSync` 给 prompt.ts，避免大面积 async 传染。`MemoryProvider` 接口仍返回 `Promise` 以兼容 S10；Manager 对 sqlite 实现可 `void` 同步路径或 `deasync` **禁止**——应用：

**最终决议：** `buildPrompt` 保持 **同步**；`MemoryManager.prefetchForIssue` 对当前 provider 若为 sqlite-text 则内部同步查库；接口层 `prefetch` 仍 `async`，Manager 暴露：

```typescript
prefetchForIssueSync(issue): string | null  // S09 prompt 用
// 内部: 仅当 provider 支持 sync 或直接调 SqliteTextProvider 方法
```

更干净做法：**SqliteTextProvider 增加 `prefetchSync`/`syncTurnSync`**，Manager 检测 `name==='sqlite-text'` 走同步；S10 mem0 再让 buildPrompt async。  

**S09 采用：**  
- `buildPrompt` **改为 `async`** 若 run-worker 已 `await buildPrompt`（实现时核对）；  
- 若现为同步调用，则 **改为 await** 一处即可。  

实现计划阶段以代码为准：**优先最小改动——Manager.prefetchForIssue 内对 Sqlite 用同步 drizzle，返回 Promise.resolve(block)，buildPrompt 变 async 并改 call site 一处。**

---

## 7. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/memory?q=&limit=` | 检索；q 空则最近 limit 条 |
| POST | `/api/memory` | body `CreateMemoryInput` → 201 MemoryItem |
| GET | `/api/memory/status` | `{ provider, available }` |

无 WS 事件要求（S09）。

---

## 8. 验收标准

### 8.1 工程
- [ ] `pnpm -r typecheck` 全绿  
- [ ] migration 可应用  
- [ ] `pnpm dev` 可起  

### 8.2 写入
- [ ] run **completed** 后 `memory_item` 增加一行（含 issueId/runId/text）  
- [ ] run **failed/cancelled** 不增加（对比测）  
- [ ] POST `/api/memory` 可手动写入  

### 8.3 读取注入
- [ ] 存在相关 text 时，`buildPrompt` 含 `# Memory Context`  
- [ ] 无记忆时 prompt 无该块（不留空标题）  
- [ ] 顺序：skill → wiki(若有) → memory → briefing → body  

### 8.4 隔离
- [ ] provider 抛错不导致 run 失败 / prompt 返回 null  
- [ ] S01–S08 路径回归  

### 8.5 非目标（不验）
- 向量召回质量、mem0、graphiti、记忆 UI 完整页  

---

## 9. Borrow matrix

| ID | 能力 | 主抄 | 锚点 | 落点 | 不抄 |
|---|---|---|---|---|---|
| G-MEM-ABC | Provider 契约 | hermes | memory_provider.py 生命周期 | types.ts + SqliteTextProvider | 全套 optional hooks |
| G-MEM-MGR | ≤1 external + 隔离 | hermes | memory_manager.py | manager.ts | 线程池细节 |
| G-MEM-SYNC | 成功回合才写 | hermes | interrupted skip | run-worker completed only | 每 LLM turn |
| G-MEM-READ | 执行前注入 | hermes prefetch | turn_context prefetch | buildPrompt | conversation_loop 改写 |
| G-MEM-FENCE | 参考围栏 | hermes memory-context | build_memory_context_block | `# Memory Context` 文案 | StreamingContextScrubber |
| G-MEM-STORE | 本地可跑 | 本项目 SQLite | AGENTS Phase0-2 DB | memory_item 表 | S09 上 PG |

---

## 10. 风险

| 风险 | 缓解 |
|---|---|
| prompt 过长 | limit 5；文本截断 M10 |
| 与 Wiki 重复 | 产品叙事分工；记忆偏「本次执行结果」 |
| LIKE 检索弱 | S09 可演示；S10 向量 |
| buildPrompt async 传染 | 优先单 call site await；sqlite 查询轻 |
| 取不到 assistant 全文 | run_message 回退拼接 |
| 测试污染 | 不强制；手动 API 验证即可 |

---

## 11. 自审记录

| 检查项 | 结果 |
|---|---|
| Placeholder | buildPrompt async 策略已收敛为「Manager+provider Promise + call site await」；无 TBD 功能块 |
| 内部一致 | M1–M10 与 §1–§8 一致 |
| 范围 | 仅 S09；S10/S11 附录边界清晰 |
| Hermes 对齐 | 有映射表；不假装拥有 turn loop |
| 与 S05/S08 | prompt 顺序显式 |
| 与执行层 | 只挂 run-worker + buildPrompt，不改 CLI backend |
| YAGNI | 无 mem0/pgvector/UI 大页 |

### 对照代码假设（实现时核对）

- `run-worker.ts` 有明确 completed / failed / cancelled 分支  
- `buildPrompt` 在 `runtime/prompt.ts`，已有 skill /（S08）wiki 插入点  
- 无现成 memory 模块，新建 `server/src/memory/`  

---

## 12. 附录：S10 / S11（不实现）

**S10：** `Mem0Provider` 或 `PgvectorProvider`；config `MEMORY_PROVIDER=sqlite-text|mem0`；`MemoryManager.setExternal`；检索评测可选。  

**S11：** 记忆 cite 展示、更多 ambient（如 comment 人工决策）、graphiti 开关与论文 ablation 脚本。  

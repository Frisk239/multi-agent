# G6-1 run 认领按优先级调度 —— closeout（2026-08-03）

**刀名：** G6-1 run 认领按优先级调度（紧急不排后）
**Goal：** G6（后端执行与运营精细度）/ 第八波第一刀

## 现状基线（开工前核对）

- `run-worker.ts:116` tick 认领仅 `orderBy(asc(createdAt))` —— FCFS，与 roadmap 基线一致（未变）。
- issue 表已有 `priority` 列（enum urgent/high/medium/low/none，schema.ts:143）；agent_run 无快照列。
- 上游锚点（multica `server/pkg/db/queries/agent.sql`）：ClaimAgentTask 认领子查询 `ORDER BY atq.priority DESC, atq.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`（实际行号 :508 起，deep 引用 :349 为旧行号，语义一致）——multica priority 为整数列；本仓为文本 enum，用 CASE 映射数值序对齐。

## 落地改动

1. **快照列**：`db/schema.ts` agentRuns 加 `priority`（enum 同上，`notNull().default('none')`）；migration `drizzle/0051_agent_run_priority.sql`（`ALTER TABLE agent_run ADD priority text DEFAULT 'none' NOT NULL`）+ `meta/_journal.json` idx 51（手写条目，0046-0050 同法）。
2. **tick 认领排序**：`run-worker.ts:116-122` `orderBy` 改 `CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`（DESC 语义）+ `asc(createdAt)`（同级 FCFS）。CASE 写死 enum 映射，none/未知兜底 4（最尾）。
3. **enqueue 拷贝（快照语义）**：
   - `run-service.ts` checkAndEnqueue：insert 前查 issue 行 → `priority: issueRow?.priority ?? 'none'`（主路径）。
   - `subagent-dispatch.ts`：子代理 run 有父 issue 时拷贝（无则 none）。
   - `auto-retry.ts` ×2：重试 child 与 fallback 改派 child **继承父 run 快照**（不因重试掉队）。
   - automation / quick-runs / chat：无 issue 的 quick_create/chat → 默认 none（列默认，无需改）。
4. **API 可观测**：`reshape.ts` toAgentRun 映射 `priority`（旧行兜底 none）；shared `AgentRun.priority`（`Priority.default('none')`）。

## 测试与实证

- `run-worker.test.ts` +2：
  - **urgent 越过先入队 low**（low createdAt 早 1s，urgent 后入 → execute 顺序 [urgent, low]）
  - **同级仍 FCFS**（同 medium，早 createdAt 先 claim）
- `critical-path.integration.test.ts` +1：enqueue 快照 —— iss priority=high → run.priority=high；改 issue 为 low 后新 run（另一 agent）拿 low、旧 run 快照不动（enqueue 时点拷贝语义）。
- `auto-retry.test.ts`：原子用例强化 —— parent urgent → child.priority=urgent（继承）。
- **稳定性修复**：executeRun 首段 `await import('./stale-runs.js')` 动态加载在全量负载下首次转译 >20ms，20ms flush 等不到第二条 execute 链 → 新用例改 `vi.waitFor`（顺序仍由微任务 FIFO 保证 = claim 顺序投影）；priority claim 用例显式错开 createdAt（同毫秒会退化到物理序）。单跑 ×4 + 全量 ×2 均绿。
- **门禁全量**：`pnpm typecheck` 全绿；`pnpm test` **shared 121 + server 905 + web 465 = 1491 全绿**（基线 1488 + 3 新用例；web 4 个测试 fixture 补 priority 字段）。
- **dev.db 真机冒烟**：`db:migrate` 应用 0051 ✓；起 dev server → `/api/runs` 新 run 带出 issue 快照（priority=medium），迁移前旧行兜底 none。

## 决策记录

1. **文本 enum + CASE 数值序**，不把 issue.priority 改整数：与 issue 表同构、零迁移负担；排序语义对齐 multica 整数 priority DESC。
2. **快照在 enqueue 时点**：issue 后续改优先级不影响已排队 run（与 issue 行解耦，排序稳定可预期）；auto-retry/改派继承父快照保证「重试不掉队」。
3. **默认 none 而非 nullable**：避免 SQLite NULL 排序歧义（ASC 时 NULL 在前），与 issue 默认一致。

## 下一刀建议

G6-2 Automation 派发幂等顺序修复（先插占位/事务，赢家才干活；学 multica tryClaim `manager.go:95`）——roadmap §4 第 17 行既定顺序。

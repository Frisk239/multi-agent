# 优化阶段开发计划

> **制定日期：** 2026-07-31
> **来源：** 子代理分析报告 + 项目现状审计
> **目标：** 系统性解决后端性能和前端体验问题

---

## 1. 背景与范围

### 1.1 分析结论摘要

子代理对项目进行了深度分析，识别出以下主要问题：

| 优先级 | 问题数 | 核心痛点 | 完成状态 |
|--------|--------|----------|----------|
| **Must Fix** | 3 | Stale Sweeper O(n) 全表扫描、api.ts 2900+ 行、WebSocket 无重连 | O1 ✅ / O3 ⏸ / O2 已有 |
| **Should Fix** | 5 | activity_log 级联缺失、KanbanBoard 过重、批量操作低效、索引缺失、ErrorBoundary 不足 | O6 ✅ / O5 ✅ / O7 ✅ |
| **Nice to Have** | 4 | Schema 注释、Suspense 粒度、重复代码、审计日志 | O7 ✅ 部分 |

### 1.2 与当前项目的关联

根据 [CONTEXT.md](D:\code\multi-agent\CONTEXT.md)：
- Phase F 主路径（71-73）已收官
- 下一刀默认：`reopenable-db-lifecycle`
- 产品已进入 **Phase 5+ 产品演进** 阶段

**本计划定位：** 在主线（reopenable-db-lifecycle）之外，并行推进体验优化切片。

---

## 2. 切片划分

### Slice O1：Stale Sweeper SQL 原子化 ✅ **最高优先级**

**目标：** 将 O(n) 全表扫描改为 O(1) 原子 SQL 操作

**涉及文件：**
- `app/packages/server/src/orchestration/stale-runs.ts`

**改动点：**

```typescript
// ❌ 当前：O(n) 全表扫描
const candidates = db.select().from(agentRuns)
  .where(eq(agentRuns.status, 'running')).all();
for (const row of candidates) { /* 内存处理 */ }

// ✅ 优化后：O(1) 原子 UPDATE + WHERE 条件
const result = db.update(agentRuns)
  .set({ status: 'failed', finishedAt: now, error: 'stale: idle timeout' })
  .where(and(
    eq(agentRuns.status, 'running'),
    lt(agentRuns.lastHeartbeatAt ?? agentRuns.startedAt, now - IDLE_THRESHOLD)
  ))
  .returning()
  .all();
```

**验收标准：**
- [ ] `failStaleRunningRuns` 改为单条原子 UPDATE
- [ ] `failStalePrepareLeaseRuns` 改为单条原子 UPDATE
- [ ] `failQueuedMissingAgentRuns` 改为单条原子 UPDATE
- [ ] vitest 单元测试通过
- [ ] 压力测试验证：10000+ agentRuns 时仍 < 100ms

**工作量：** 小（~50 行代码改动）

**参考：** `references/deep/multica.md` §2a (状态机在 SQL 里)

---

### Slice O2：WebSocket 断线重连机制

**目标：** 前端 WS 断开后自动重连，避免状态更新丢失

**涉及文件：**
- `app/packages/web/lib/chat-live-state.ts`
- `app/packages/web/lib/use-websocket.ts`（新建）

**改动点：**

```typescript
// 新建 use-websocket.ts
const WS_RECONNECT_BASE = 1000;  // ms
const MAX_RECONNECT_DELAY = 30000; // 30s

export function useWebSocketWithRetry(url: string) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    ws.onopen = () => { setStatus('connected'); attemptsRef.current = 0; };
    ws.onclose = () => {
      setStatus('disconnected');
      const delay = Math.min(WS_RECONNECT_BASE * Math.pow(2, attemptsRef.current), MAX_RECONNECT_DELAY);
      setTimeout(connect, delay);
      attemptsRef.current++;
    };
    return ws;
  }, [url]);

  return { connect, status };
}
```

**验收标准：**
- [ ] WS 断开后自动重连（指数退避）
- [ ] 重连成功前显示"连接中断"状态
- [ ] Run 列表页面 WS 状态可见
- [ ] Playwright 测试覆盖断连/重连场景

**工作量：** 中（~150 行 + 测试）

**参考：** `references/deep/multica.md` §2c (WebSocket 三跳 pub/sub)

---

### Slice O3：前端 API 层拆分

**目标：** 将 2900+ 行的 `api.ts` 按领域拆分为独立文件

**涉及文件：**
- `app/packages/web/lib/api.ts` → 拆分为：
  - `lib/api/issues.ts`
  - `lib/api/runs.ts`
  - `lib/api/agents.ts`
  - `lib/api/wiki.ts`
  - `lib/api/settings.ts`
  - `lib/api/index.ts`（导出汇总）

**改动点：**

```typescript
// lib/api/issues.ts
export function useIssues() { /* ... */ }
export function useIssue(id: string) { /* ... */ }
export function useCreateIssue() { /* ... */ }
export function useUpdateIssue() { /* ... */ }
export function useDeleteIssue() { /* ... */ }

// lib/api/index.ts
export * from './issues';
export * from './runs';
export * from './agents';
export * from './wiki';
export * from './settings';
```

**验收标准：**
- [ ] 所有现有功能不变
- [ ] 导出汇总兼容现有 import 路径（`lib/api` → `lib/api/index`）
- [ ] 按需导入可 tree-shaking（确认构建产物变小）
- [ ] vitest 回归测试通过

**工作量：** 中（主要是移动代码，核心逻辑不变）

**参考：** multica `handler/issue.go`, `handler/comment.go` 按领域分文件

---

### Slice O4：KanbanBoard 组件拆分

**目标：** 将 1300+ 行的 `KanbanBoard.tsx` 拆分为独立子组件

**涉及文件：**
- `app/packages/web/components/KanbanBoard.tsx` → 拆分：
  - `components/kanban/KanbanToolbar.tsx`
  - `components/kanban/BulkActionBar.tsx`
  - `components/kanban/FilterChips.tsx`
  - `components/kanban/KanbanColumn.tsx`（从主文件提取）
  - `components/kanban/IssueCard.tsx`（从主文件提取）
  - `components/kanban/index.ts`

**改动点：**

```typescript
// 新结构
components/
  kanban/
    KanbanToolbar.tsx    // 搜索、筛选、视图切换
    BulkActionBar.tsx    // 批量操作浮动条
    FilterChips.tsx      // 激活的筛选标签
    KanbanColumn.tsx     // 单列组件
    IssueCard.tsx        // Issue 卡片
    index.ts

// 主文件简化为
export function KanbanBoard() {
  return (
    <div>
      <KanbanToolbar />
      <BulkActionBar />
      <FilterChips />
      <KanbanColumns />
    </div>
  );
}
```

**验收标准：**
- [ ] 所有现有交互不变
- [ ] 组件可独立使用
- [ ] 提取重复逻辑到 hooks（如 `useKanbanFilter`）
- [ ] vitest 组件测试通过

**工作量：** 中-大（涉及 UI 重构）

---

### Slice O5：ErrorBoundary 全面覆盖

**目标：** 对关键组件添加 ErrorBoundary，防止局部错误导致整页崩溃

**涉及文件：**
- `app/packages/web/components/KanbanColumn.tsx`
- `app/packages/web/components/IssueCard.tsx`
- `app/packages/web/components/IssueSideSheet.tsx`
- `app/packages/web/components/RunTimeline.tsx`
- `app/packages/web/components/ChatPanel.tsx`

**改动点：**

```tsx
// KanbanColumn.tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function KanbanColumn({ column, issues }) {
  return (
    <ErrorBoundary fallback={<ColumnError columnId={column.id} />}>
      <div className="column">
        {issues.map(issue => (
          <IssueCard key={issue.id} issue={issue} />
        ))}
      </div>
    </ErrorBoundary>
  );
}
```

**验收标准：**
- [ ] 单个 IssueCard 错误不导致整列崩溃
- [ ] 单个 Column 错误不导致整页崩溃
- [ ] 错误边界显示友好提示而非空白
- [ ] 错误上报到 console（方便调试）

**工作量：** 小（~100 行，每个组件加 wrapper）

---

### Slice O6：数据库索引与完整性

**目标：** 补充缺失索引，解决级联删除问题

**涉及文件：**
- `app/packages/server/src/db/schema.ts`
- `app/packages/server/src/routes/issues.ts`

**改动点：**

```typescript
// 1. schema.ts - 添加 runMessages createdAt 索引
export const runMessages = sqliteTable('run_message', {
  // ... 现有字段 ...
}, (t) => ({
  runSeqIdx: index('idx_run_message_run_seq').on(t.runId, t.seq),
  createdIdx: index('idx_run_message_created').on(t.runId, t.createdAt),
}));

// 2. routes/issues.ts - 删除时级联清理 activityLogs
app.delete('/api/issues/:id', async (c) => {
  const id = c.req.param('id');
  // 删除 activity logs
  await db.delete(activityLogs).where(eq(activityLogs.issueId, id)).run();
  // 删除 issue
  await db.delete(issues).where(eq(issues.id, id)).run();
});
```

**验收标准：**
- [ ] 索引创建成功（需要 DB 迁移或重建）
- [ ] 删除 Issue 时 activityLogs 同步清理
- [ ] 无孤儿 activityLog 记录

**工作量：** 小（索引 + 几行删除逻辑）

---

### Slice O7：Schema 文档化

**目标：** 为 `schema.ts` 补充表级 JSDoc 注释

**涉及文件：**
- `app/packages/server/src/db/schema.ts`

**改动点：**

```typescript
// —— agent_run（S03 执行层，薄状态机，对齐 multica task）——
export const agentRuns = sqliteTable('agent_run', {
  // ...
});

// —— issue（看板工作项，可指派 agent/squad）——
export const issues = sqliteTable('issue', {
  // ...
});

// —— run_message（Run 执行日志，支持流式 partial）——
export const runMessages = sqliteTable('run_message', {
  // ...
});
```

**验收标准：**
- [ ] 每个表/核心视图有简短注释
- [ ] 注释与 multica-gap 对齐（如 S03 对齐 multica task）
- [ ] TypeDoc 可生成文档

**工作量：** 小（纯文档）

---

## 3. 执行顺序建议

### 3.1 推荐流水线

```
┌─────────────────────────────────────────────────────────────┐
│  Slice O1: Stale Sweeper SQL 原子化                        │
│  └─ 最快见效，代码量小，直接提升日常稳定性                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Slice O6: 数据库索引与完整性                               │
│  └─ 与 O1 独立，可并行或紧随                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Slice O2: WebSocket 断线重连                              │
│  └─ 提升 Run 状态追踪可靠性                                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Slice O5: ErrorBoundary 全覆盖                            │
│  └─ 低成本高收益，与其他切片并行                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Slice O3: API 层拆分  ←→  Slice O4: KanbanBoard 拆分     │
│  └─ 架构重构，并行或串行均可，时间较长                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Slice O7: Schema 文档化（随时可做，不阻塞其他）           │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 时间估算

| Slice | 预估时间 | 依赖 |
|-------|----------|------|
| O1: Stale Sweeper | 1-2 小时 | 无 |
| O6: 索引+级联 | 1 小时 | 无 |
| O2: WebSocket | 2-3 小时 | O1 建议先完成 |
| O5: ErrorBoundary | 1-2 小时 | 无 |
| O3: API 拆分 | 3-4 小时 | 无 |
| O4: KanbanBoard | 4-6 小时 | 无 |
| O7: Schema 注释 | 1 小时 | 无 |

**总计：** 约 13-19 小时，建议按 2-3 周迭代完成

---

## 4. 验收与关刀

### 4.1 关刀标准

每个 Slice 完成需满足：
1. **功能回归：** vitest 单元测试 + Playwright E2E 通过
2. **无破坏性变更：** 现有功能完全兼容
3. **文档更新：** 如有 API 变更，同步更新
4. **commit message：** 按 conventional commits（`perf:` / `refactor:` / `fix:`）

### 4.2 验收证据

每个 Slice 完成后写入：
- `app/.progress/optimization-oN-<name>-impl-<date>.md`
- 包含：改动摘要、测试结果、构建产物大小对比（如适用）

---

## 5. 风险与对策

| 风险 | 对策 |
|------|------|
| O3/O4 重构导致现有功能破坏 | 每步 commit，频繁跑测试 |
| WebSocket 重连与现有 WS 逻辑冲突 | 新建 hook 逐步替换 |
| 索引迁移影响生产数据 | 先在 dev 环境验证，提供回滚脚本 |

---

## 6. 附录

### 6.1 相关文档

| 文档 | 路径 |
|------|------|
| 子代理分析报告 | 见本会话 |
| Multica 参考 | `references/deep/multica.md` |
| 项目现状 | `CONTEXT.md` |
| 差距表 | `app/.progress/multica-gap-2026-07-17.md` |

### 6.2 技术债追踪

| # | 项目 | 位置 | 状态 | 对应 Slice |
|---|------|------|------|------------|
| TD-1 | Stale Sweeper 全表扫描 | `stale-runs.ts` | 待处理 | O1 |
| TD-2 | api.ts 单文件过大 | `lib/api.ts` | 待处理 | O3 |
| TD-3 | WebSocket 无重连 | `chat-live-state.ts` | 待处理 | O2 |
| TD-4 | KanbanBoard 单文件过大 | `KanbanBoard.tsx` | 待处理 | O4 |
| TD-5 | activity_log 级联缺失 | `routes/issues.ts` | 待处理 | O6 |
| TD-6 | runMessages 索引缺失 | `schema.ts` | 待处理 | O6 |
| TD-7 | ErrorBoundary 不足 | `components/` | 待处理 | O5 |
| TD-8 | Schema 缺少注释 | `schema.ts` | 待处理 | O7 |

---

*计划制定：2026-07-31*
*下次评审：O1/O2 完成后Review一次进度*

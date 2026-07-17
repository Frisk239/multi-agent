# S12 产品硬化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans 或按本项目计划者-执行者执行。
> **spec：** [`docs/superpowers/specs/2026-07-17-s12-product-hardening-design.md`](../specs/2026-07-17-s12-product-hardening-design.md)
> **定位：** 厚切片、产品可用；Playwright CLI **只用于验收手验**，不提交 e2e 框架。
> **前置：** origin/main 含 S01–S10；**S11 建议已合**（侧栏 memory）；未合则侧栏跳过 memory。

**Goal:** Toast/空态/可指派新建/Ctrl+K/WS 芯片；run progress；Squads API+页；合成 Inbox；导航诚实；审计 B4/B5。

**Architecture:** 复用 AssigneeSelect、loadSquadDetail、useWsStore；Inbox 不落库聚合 comments+终态 runs；progress 仅前端 map。

**Tech Stack:** 现有 Next/RQ/Zustand/Fastify；toast 可用 `sonner` 或自研。

## Global Constraints

- **分支：** `feat/s12-product-hardening` from origin/main  
- **P4：** NewIssueForm 加指派；侧栏新建同表单  
- **P3：** `GET /api/inbox` 合成 limit=50  
- **P5：** 不落 e2e/ 目录；handoff 可写 playwright-cli 步骤结果  
- **P6：** 未实现 NAV **移除**（项目/自动化/用量/设置/我的 issue 等）  
- **执行者：** 2 棒，每棒工作量约 2× 旧切片  
- **不 push main**

## 文件结构

```
shared/schema.ts                 InboxItem
server/routes/runs.ts            B5 400
server/routes/roster.ts          GET /api/squads/:id
server/routes/inbox.ts           [新]
server/app.ts                    register inbox
web/lib/toast.tsx | sonner       toast
web/lib/ws.ts                    progress + B4
web/lib/api.ts                   hooks + mutation toast
web/lib/run-progress.ts          zustand map（或并入 ws store）
web/components/EmptyState.tsx
web/components/CommandPalette.tsx
web/components/NewIssueForm.tsx
web/components/RunStatusBar.tsx
web/components/Sidebar.tsx
web/components/InboxPage.tsx
web/components/SquadsPage.tsx
web/components/SquadDetailPage.tsx
web/app/error.tsx
web/app/inbox/page.tsx
web/app/squads/page.tsx
web/app/squads/[id]/page.tsx
web/app/globals.css              少量
```

---

# 执行者片段 A（impl-1）— Chrome + progress + B4/B5 + InboxItem 类型

> 可先不实现 Inbox/Squad 路由（类型可先加）。工作量大：一次做完 Chrome 全家桶。

### Task 1.1: shared InboxItem + B5

**Files:** `shared/src/schema.ts`, `server/src/routes/runs.ts`

```typescript
export const InboxItemKind = z.enum(['comment', 'run_completed', 'run_failed']);
export const InboxItem = z.object({
  id: z.string(),
  kind: InboxItemKind,
  createdAt: z.string().datetime(),
  issueId: BusinessId,
  issueIdentifier: z.string().optional(),
  issueTitle: z.string().optional(),
  summary: z.string(),
});
export type InboxItem = z.infer<typeof InboxItem>;
```

runs GET：无 `issueId` → `reply.status(400).send({ error: 'issueId required' })`

- [ ] typecheck + commit `feat(s12): InboxItem contract + runs 400 without issueId`

### Task 1.2: Toast

**Files:** `web/lib/toast.ts` 或装 `sonner`；`providers.tsx` 挂载

提供：`toastSuccess(msg)` / `toastError(msg)`

在 `api.ts` 为 createIssue、updateIssue、createComment、cancelRun 等加 onError/onSuccess toast（成功可短提示或仅错误——**产品向建议错误必 toast，成功可选**）。

- [ ] commit `feat(s12): global toast feedback`

### Task 1.3: EmptyState + 看板列空态

**Files:** `EmptyState.tsx`；`KanbanColumn` 等无数据时使用

- [ ] commit `feat(s12): EmptyState for empty lists/columns`

### Task 1.4: NewIssueForm 指派 + 侧栏新建

**Files:** `NewIssueForm.tsx`, `Sidebar.tsx`, 可能 `KanbanBoard.tsx`

- 去掉 assignee:null；用 agents/squads 列表构建选择（可简化版 select，或抽共享逻辑）
- `CreateIssueInput` 已支持 assignee
- 侧栏按钮：`router.push('/?new=1')`；`KanbanBoard`/`NewIssueForm` 读 `useSearchParams` 自动 open
- 成功 toast

- [ ] commit `feat(s12): NewIssue with assignee + sidebar CTA`

### Task 1.5: Command palette Ctrl+K

**Files:** `CommandPalette.tsx`；`layout` 或 `Providers` 挂载；Sidebar 搜索按钮打开

- 命令：导航已实现路由 + 「新建 Issue」
- Esc 关闭；过滤 input

- [ ] commit `feat(s12): Ctrl+K command palette`

### Task 1.6: WS 芯片 + 工作中 + 导航诚实

**Files:** `Sidebar.tsx`

- 展示 `useWsStore().status`
- 工作中计数：`useIssues` filter in_progress|in_review
- NAV：只保留已实现 href；去掉 projects/automation/usage/settings/my-issues 等 disabled 项（或 section 标注）
- memory：main 有 `/memory` 则加 href

- [ ] commit `feat(s12): honest nav + WS chip + working count`

### Task 1.7: run:progress UI + B4

**Files:** `ws.ts`, `RunStatusBar.tsx`，可选 `run-progress-store.ts`

```typescript
// on run:progress
setProgress(event.runId, event.text.slice(0, 200))
// RunStatusBar: show progress for active running run
```

B4：删除 `issue:created` 时对 `['issue', id]` 的 setQueryData（仅更新列表）

- [ ] commit `feat(s12): live run progress + fix issue:created cache`

### Task 1.8: error.tsx

**Files:** `web/app/error.tsx`

- [ ] commit `feat(s12): app error boundary`
- [ ] handoff `s12-impl-1.md`

**自测：** typecheck；手动新建带指派；Ctrl+K；断 WS 看芯片；无 progress 时不炸。

---

# 执行者片段 B（impl-2）— Squads + Inbox + 联调

### Task 2.1: GET /api/squads/:id

**Files:** `roster.ts`

```typescript
app.get('/api/squads/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const detail = loadSquadDetail(id);
  if (!detail) return reply.status(404).send({ error: 'squad 不存在' });
  return detail;
});
```

- [ ] commit `feat(s12): GET /api/squads/:id`

### Task 2.2: Squads UI

**Files:** pages + components；`useSquads` 已有 summary；新增 `useSquad(id)`

- 列表链到详情；展示 protocol / directive / members

- [ ] commit `feat(s12): Squads list and detail pages`

### Task 2.3: GET /api/inbox

**Files:** `routes/inbox.ts` + app register

算法见 spec §7.2；返回 `InboxItem[]`

- [ ] commit `feat(s12): synthetic GET /api/inbox`

### Task 2.4: Inbox UI

**Files:** `InboxPage` + `/inbox`；侧栏 href（若 impl-1 已加则接上）

- 点击 → `/issues/[id]`

- [ ] commit `feat(s12): Inbox page`

### Task 2.5: 产品路径验收 + handoff

用 **playwright-cli 或手动** 验证（**不**提交 e2e 代码）：

1. 首页新建 Issue + 指派  
2. Ctrl+K 跳转 Wiki/Inbox/Squads  
3. 打开小队详情见 protocol  
4. 评论后 Inbox 出现条目  
5. （可选）真 run 见 progress  
6. typecheck 全绿  

写 `s12-impl-2.md`：路径、截图可选、已知限制。

---

## 验收总览（计划者）

| 包 | Task |
|---|---|
| Chrome | 1.2–1.6, 1.8 |
| Progress + B4/B5 | 1.1, 1.7 |
| Squads | 2.1–2.2 |
| Inbox | 1.1 类型 + 2.3–2.4 |
| 联调 | 2.5 |

---

## 排雷（执行者）

| ID | 注意 |
|---|---|
| N1 | BusinessId 已 min(1)，seed agent id 可作 assignee |
| N2 | CreateIssue 带 assignee 会走 server enqueue（与详情指派一致） |
| N3 | progress 事件可能高频：只存最后一条 |
| N4 | Inbox 时间字段：comment/run 的 createdAt 统一 ISO |
| N5 | 勿 commit `wiki/` 运行目录 |
| N6 | sonner 若 pnpm 加依赖，在 `app/packages/web` |

---

## 启动提示词

### impl-1

```
你是 S12 产品硬化执行者 impl-1（工作量大）。

必读：AGENTS.md；
docs/superpowers/specs/2026-07-17-s12-product-hardening-design.md；
docs/superpowers/plans/2026-07-17-s12-product-hardening.md 片段 A。

分支 feat/s12-product-hardening 从 origin/main 切。
完成：InboxItem+B5、Toast、空态、NewIssue 指派+侧栏新建、Ctrl+K、
WS/工作中/诚实导航、run progress、B4、error.tsx。
不强制实现 Inbox/Squad 路由（留给 impl-2）。
typecheck 全绿；写 s12-impl-1.md 并 push。不 push main。
```

### impl-2

```
你是 S12 执行者 impl-2。

必读：计划片段 B + s12-impl-1.md。
完成：GET squads/:id、Squads 页、GET inbox、Inbox 页、联调验收。
Playwright CLI 可用来点验，不要提交 e2e 测试框架。
写 s12-impl-2.md 并 push。
```

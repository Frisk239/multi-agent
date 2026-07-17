# Handoff: s12-impl-1

> 切片：`S12` · 角色：`impl` · 序号：`1`
> 日期：2026-07-17

## 上下文（给下一个会话读）

S12 产品硬化厚切片，2 执行者。本棒 = 片段 A（Chrome 全家桶 + progress + B4/B5 + InboxItem 类型）。

- spec：`docs/superpowers/specs/2026-07-17-s12-product-hardening-design.md`
- plan：`docs/superpowers/plans/2026-07-17-s12-product-hardening.md` 片段 A
- 分支：`feat/s12-product-hardening`（from `origin/main`，含已合 S11 /memory）
- worktree：`.worktrees/s12-product-hardening`

impl-2 负责：`GET /api/squads/:id`、Squads UI、`GET /api/inbox`、Inbox UI、联调验收。

## 本会话完成了什么

### Task 1.1 — InboxItem + B5 + Create enqueue
- `shared/src/schema.ts`：`InboxItemKind` / `InboxItem` 契约（impl-2 消费）
- `server/routes/runs.ts`：无 `issueId` → **400** `{ error: 'issueId required' }`（B5）
- `server/routes/issues.ts`：POST Create 带 assignee 时与 PUT 一致 enqueue（N2）

### Task 1.2 — Toast
- `web/lib/toast.tsx`：自研 ToastProvider + `toastSuccess` / `toastError`
- `providers.tsx` 挂载
- `api.ts`：createIssue / updateIssue / createComment / cancelRun / createMemory / createWikiPage 错误必 toast；关键成功可选 toast

### Task 1.3 — EmptyState
- `EmptyState.tsx`；`KanbanColumn` 无数据时空态

### Task 1.4 — NewIssue 指派 + 侧栏新建
- `NewIssueForm`：agent/squad 下拉；`/?new=1` 自动展开（Suspense 包一层）
- 侧栏「新建 issue」→ `router.push('/?new=1')`

### Task 1.5 — Ctrl+K
- `CommandPalette.tsx`：导航已实现路由 + 新建 Issue + 最近 issues 过滤；Esc 关闭

### Task 1.6 — 诚实导航 + WS + 工作中
- 移除假入口（inbox/my-issues/projects/automation/squads/usage/settings 等 disabled 项）
- 保留 Issues / agents / wiki / **memory(S11)** / runtimes / skills
- WS 芯片（connecting/open/closed）+ 工作中计数（in_progress|in_review）
- 搜索按钮打开命令面板
- **Inbox / Squads 未加 href**（留给 impl-2 接路由后加）

### Task 1.7 — progress + B4
- `useRunProgressStore`：runId → 最新 text（截断 200）
- `ws.ts`：`run:progress` 更新；终态 clear
- B4：`issue:created` **仅**更新 `['issues']` 列表，**不** `setQueryData(['issue', id])`；`issue:updated` 仍写单条
- `RunStatusBar`：running 时展示 progress 一行 ellipsis

### Task 1.8 — error.tsx
- `app/error.tsx` + globals 样式（toast/empty/cmdk/ws/progress/error）

**未做（故意留给 impl-2）：** Squads/Inbox 路由页与 API。

## 自测结果

```
$ pnpm -r typecheck
# shared / server / web 均 Done（全绿）

# B5 inject smoke（临时脚本，未入库；无 migrate 的空 DB 下有 issueId 会 500 属预期）
no issueId 400 {"error":"issueId required"}
```

未跑完整 monorepo `pnpm dev` UI 手点；人评建议：

1. `PORT=3001` server + web
2. 侧栏新建 Issue + 指派 agent
3. Ctrl+K 导航 / 新建
4. 看 WS 芯片；断 server 看「已断开」
5. 有 run 时 progress 行（可选）

## 与计划的偏离

| 点 | 说明 |
|---|---|
| toast | 自研 ~90 行，**未**装 sonner（N6 可选） |
| 侧栏 Inbox/Squads | 计划「诚实导航」+ impl-2 才有路由 → **整项移除**而非 disabled，避免假入口；impl-2 加页时在 NAV 加 href |
| Create enqueue | 计划排雷 N2 要求；在 1.1 一并改 POST issues |
| CommandPalette | 挂在 Sidebar 内 state（非 Providers），与侧栏搜索同开 |

## 遗留 / 下一个执行者要注意的点

1. **读本 handoff + 计划片段 B**。
2. 侧栏 NAV 在 `Sidebar.tsx` 的 `NAV_ITEMS`：加  
   `{ id: 'inbox', … href: '/inbox' }`、`{ id: 'squads', … href: '/squads' }`。  
   命令面板也可加对应 nav 项。
3. `InboxItem` 已在 shared；inbox 路由合成算法见 spec §7.2。
4. `loadSquadDetail` 已有；`GET /api/squads/:id` 直接复用。
5. 勿 commit `app/packages/server/wiki/` 运行目录；不落 e2e 框架。
6. 继续在 **`feat/s12-product-hardening`** 上提交，不 push main。
7. Create 带 assignee 会 enqueue——联调时注意本机 CLI/worker 是否空转失败（与详情指派相同）。

## 验收结论（仅计划者填）

- [x] typecheck 通过（impl-1 自测）
- [ ] `pnpm dev` 人评 / impl-2 联调
- [ ] 切片验收标准达成（需 impl-2 + 计划者）
- 结论：片段 A 代码交付完毕，待 push 后 impl-2 接力。

# Handoff: bu01-impl-2

> 切片：`补1` / `bu01` · 角色：`impl` · 序号：`2`  
> 日期：2026-07-17

## 上下文（给下一个会话读）

- **阶段：** 补充阶段补1 = 可靠性 + 真 Inbox  
- **本棒：** plan Task 3–5（inbox writer + 真表 API + UI/角标 + 回归）  
- **前置：** impl-1 已验收（Task 1–2；`0007` 含 `inbox_item` / `issue_subscriber`；stale/orphan）  
- **分支：** `feat/bu01-reliability-inbox`  
- **worktree：** `.worktrees/bu01-reliability-inbox`  
- **真源：** [`docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md`](../../docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md)  
- **注意点：** [`app/.progress/bu01-planner-1.md`](./bu01-planner-1.md)

## 本会话完成了什么

### Task 3 — writer + 真表 API + 钩子
- 新建 `orchestration/inbox-writer.ts`：
  - `ensureIssueSubscriber` / `notifyInbox`（dedupe by recipient+dedupeKey）
  - `notifyCommentCreated`（**仅** `type==='comment'`；status_change 过滤）
  - `notifyRunTerminal`（completed|failed）
  - `notifyAssigned`
  - 默认 recipient = `LOCAL_MEMBER`；发布 `inbox:item`
- 重写 `routes/inbox.ts`（删除 S12 comments+runs 合成 merge）：
  - `GET /api/inbox` → `{ items, unreadCount }`（默认 `archived=0`；`includeArchived=1`）
  - `POST /api/inbox/:id/read` / `.../archive`
  - `GET /api/inbox/unread-count` → `{ count }`
- 接线：
  - `comments.ts` POST 成功 → `notifyCommentCreated`
  - `issues.ts` create：`ensureIssueSubscriber(..., 'creator')`；有 assignee → `notifyAssigned`
  - `issues.ts` PUT 指派 identity 变化 → `notifyAssigned`（清空指派仅 ensure subscriber）
  - `run-worker` completed/failed publish 后 → `notifyRunTerminal`；agent 终态 comment 也写 inbox
  - `stale-runs` stale/orphan fail 后也 `notifyRunTerminal`（与 `run:failed` 一致）

### Task 4 — Web
- `useInbox` → `InboxListResponse`；新增 `useInboxUnreadCount` / `useMarkInboxRead` / `useArchiveInbox`
- `InboxPage`：未读样式、已读/归档按钮、点击可 mark read 后跳 Issue；`assigned` 标签
- `Sidebar`：Inbox 未读角标（0 不显示）
- `ws.ts`：`inbox:item` 与 `run:completed|failed` invalidate `['inbox']` / `['inbox-unread']`
- `globals.css`：角标 + 未读/操作区样式

### Task 5 — 回归 + 文档
- `pnpm -r typecheck` 绿
- API smoke（PORT=3013）见下
- 进度表：补1 → 实现完成待验收/PR
- handoff 本文件

### Commits（本棒）
- `e78b59a` feat(bu01): persisted inbox_item + writer hooks + APIs  
  （含 server hooks + web UI；前后端同 commit 以免半残契约）
- （本 handoff / 进度表另 commit）

## 自测结果

### typecheck

```
$ cd app && pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck$ tsc --noEmit
packages/shared typecheck: Done
packages/web typecheck$ tsc --noEmit
packages/server typecheck$ tsc --noEmit
packages/web typecheck: Done
packages/server typecheck: Done
```

### migrate

```
$ cd app/packages/server && pnpm exec tsx src/db/migrate.ts
✓ 迁移完成
```

（本地已有 dev.db；seed 因 workspace 主键冲突跳过，沿用 impl-1 数据。）

### API smoke（PORT=3013）

```
issues:200
wiki:200
memory:200
GET /api/inbox → {"items":[],"unreadCount":0}
POST comment "bu01 inbox smoke"
  → unread 1 items 1 first_id <UUID> type comment read False
POST .../read → read True；unread-count {count:0}
POST .../archive → archived True；默认 list items 0 / has_item False
PUT assignee agent → types 含 assigned + run_failed（enqueue 后 runtime 未配置 → fail 进 inbox）
  unread 2
PUT status in_progress（status_change）→ types 仍仅 run_failed, assigned（无新 comment/status 噪音）
```

### 验收勾选（Task 5）

- [x] 启动 orphan / stale：impl-1 已验；本棒未改核心逻辑，仅 fail 路径补 `notifyRunTerminal`
- [x] 评论 → inbox 行 UUID + unread+1  
- [x] mark read → unread-1  
- [x] archive → 默认列表消失  
- [x] run fail/complete → inbox（smoke 见 assign 后 `run_failed`）  
- [x] 指派 → `assigned`  
- [x] status_change **不**进 inbox  
- [x] 侧栏角标（代码 + unread-count API；人评可 `pnpm dev` 点侧栏）  
- [x] typecheck 绿  
- [x] wiki/memory/issues 回归 200  

未在本机起完整 Next UI 点击验收（API 契约 + typecheck 齐；人/计划者可 PORT=3001 server + web 复核角标）。

## 与计划的偏离

1. **stale/orphan 也写 inbox**：计划写「run-worker 终态」；为避免 stale/orphan 只发 WS 无通知，在 `stale-runs` 的 `run:failed` 后同样 `notifyRunTerminal`。未改 stale/orphan 判定逻辑。  
2. **agent 终态 comment** 同步 `notifyCommentCreated`（与 member 评论一致，有 dedupe）。  
3. **archive 同时 mark read**（归档即已读，角标一致）。  
4. **server+web 同 commit**（破数组契约必须前后端同 PR；未拆 Task3/Task4 两个 commit）。  
5. **未跑完整 monorepo `pnpm dev` UI 点击**；API smoke 已覆盖 list/read/archive/assign/status_change。

## 遗留 / 给计划者与后续

- **整刀可开 PR**（新会话 code review）；计划者只验收本 handoff + diff，不写业务代码  
- 勿 commit `app/packages/server/wiki/`、`*.db`  
- 不 push main；分支 `feat/bu01-reliability-inbox`  
- 补2（Agent/Squad 运营等）**不要**在本分支做  
- 合成 Inbox 逻辑已删除；若还有客户端缓存旧数组形态，硬刷新即可  

## 验收结论（仅计划者填）

- [ ] Task 3–5 达标  
- [ ] 合成路径已删  
- [ ] read/archive/角标可用  
- [ ] typecheck + 回归证据齐  
- [ ] 可开 PR  
- 结论：<达标 / 需返工>

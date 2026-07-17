# Handoff: bu01-impl-1

> 切片：`补1` / `bu01` · 角色：`impl` · 序号：`1`  
> 日期：2026-07-17

## 上下文（给下一个会话读）

- **阶段：** 补充阶段补1 = 可靠性 + 真 Inbox  
- **本棒：** plan Task 1–2（schema/migration + heartbeat/stale/orphan）  
- **分支：** `feat/bu01-reliability-inbox`  
- **worktree：** `.worktrees/bu01-reliability-inbox`  
- **真源：** [`docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md`](../../docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md)  
- **kickoff：** [`app/.progress/bu01-planner-0.md`](./bu01-planner-0.md)  
- **下棒：** impl-2 = Task 3–5（inbox writer + API + UI + 角标 + 回归）

## 本会话完成了什么

### Task 1 — Shared 契约 + DB schema + migration
- `AgentRun.lastHeartbeatAt: string | null`
- 替换 S12 合成 `InboxItem` 为真源契约：`type`/`kind`/`severity`/`read`/`archived`/`title`/`body`/`summary` + `InboxListResponse`
- `DomainEvent` 增加 `inbox:item`
- Drizzle：`agent_run.last_heartbeat_at`、`inbox_item`、`issue_subscriber`
- 手写 migration `0007_bu01_reliability_inbox.sql` + journal idx 7
- `toAgentRun` 映射 `lastHeartbeatAt`；新增 `toInboxItem`（供 impl-2）
- **最小适配（非 Task 3）：** 合成 `GET /api/inbox` 与 `InboxPage` 补齐新字段，保证 typecheck 绿；**未**替换为真表读写

### Task 2 — Run 可靠性
- `run-control`：`hasRunAbort` / `listActiveRunIds`
- 新文件 `stale-runs.ts`：`touchRunHeartbeat` / `failStaleRunningRuns` / `recoverOrphanedRunningRuns` / `startStaleRunSweeper`
- 常量：`HEARTBEAT_INTERVAL_MS=5000`、`STALE_RUNNING_MS=120000`、`STALE_SWEEP_INTERVAL_MS=15000`
- `run-worker`：claim 写 `lastHeartbeatAt`；execute 内 5s timer；`finally` clearInterval
- `index.ts` 启动序：`recoverOrphanedRunningRuns` → `startRunWorker` → `startStaleRunSweeper` → wiki worker

### Commits
- `60e95fe` feat(bu01): schema for run heartbeat + inbox_item + subscriber
- `a077a9f` feat(bu01): run heartbeat, stale sweeper, orphan recovery
- （本 handoff 提交另见后续 commit）

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

### 可靠性 smoke（stale + orphan）

seed 后临时脚本插入 2 条 running（**未提交脚本**）：

1. `last_heartbeat_at = now-180s` → `failStaleRunningRuns`  
2. 近期 heartbeat 但无 AbortController → `recoverOrphanedRunningRuns`

```
issue 513bdbc3-8ecf-4a83-bef9-9b14b3e3c92f agent agt-lead
stale_count 1
stale_status failed stale_error stale: heartbeat timeout
orphan_count 1
orphan_status failed orphan_error orphan: no live executor after restart
[run] recovered 1 orphaned running run(s)
```

复现要点：
- 空库需先 `pnpm exec tsx src/db/seed.ts`
- stale：`status=running` 且 `last_heartbeat_at`（或回退 started/created）早于 now−120s
- orphan：DB `running` 且本进程 `!hasRunAbort(id)`（重启后 map 为空）

## 与计划的偏离

1. **合成 Inbox 最小适配**：shared 真源 `InboxItem` 会破 S12 类型；为 `pnpm -r typecheck` 全绿，给 `routes/inbox.ts`（合成 feed 填默认字段）和 `InboxPage`（`assigned` 标签 + nullable issue 链接）做了最小适配。**没有**写 inbox-writer / 真表 GET / read-archive / 角标。  
2. Smoke 用临时 `scripts/smoke-stale-orphan.ts` 本地跑完即删，未入库。

## 遗留 / 下一个执行者要注意的点

- **impl-2 范围：** plan Task 3–5（`inbox-writer`、替换 `GET /api/inbox` 为 `InboxListResponse`、comments/issues/run 终态钩子、web hooks/UI/角标、回归 handoff）
- **Breaking：** 真表 API 后响应从数组 → `{ items, unreadCount }`；web 与 server 同 PR 改完
- **表已空建好：** `inbox_item` / `issue_subscriber` 已在 0007，impl-2 **不要**再拆 migration（除非必须）
- **`toInboxItem` 已就绪**；`DomainEvent` 已含 `inbox:item`
- **默认 recipient：** `LOCAL_MEMBER`（`app/packages/server/src/local-member.ts`）
- **status_change 不进 inbox**（notifyCommentCreated 收敛）
- **勿 commit** `app/packages/server/wiki/`、`*.db`（本 worktree 有 `dev.db` 仅本地）
- **不 push main**；继续推 `feat/bu01-reliability-inbox`

## 验收结论（仅计划者填）

- [x] 分支/worktree 正确，未污染 main — `feat/bu01-reliability-inbox` @ `34f0be0`，已 push origin  
- [x] `0007_bu01_reliability_inbox.sql` + journal idx 7  
- [x] claim 写 heartbeat；执行中 touch；sweeper + orphan — 代码与 smoke 证据齐  
- [x] typecheck 绿 — 计划者复验 shared/server/web Done  
- [x] 无 wiki/ 误提交  
- 偏离可接受：合成 Inbox 最小字段适配（为真源 `InboxItem` typecheck）；**impl-2 必须删掉合成路径、上真表 API**  
- 结论：**达标，允许进入 impl-2（Task 3–5）**

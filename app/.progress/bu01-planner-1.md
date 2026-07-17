# Handoff: bu01-planner-1

> 切片：`补1` / `bu01` · 角色：`planner` · 序号：`1`（验收 impl-1）  
> 日期：2026-07-17

## 结论

**impl-1 验收通过。** 可派 **impl-2**（串行，同分支 `feat/bu01-reliability-inbox`）。

| 项 | 结果 |
|---|---|
| Task 1 schema/migration/`toInboxItem` | ✅ |
| Task 2 heartbeat/stale/orphan + 启动序 | ✅ |
| typecheck（计划者复验） | ✅ 全绿 |
| smoke stale + orphan | ✅ handoff 有输出 |
| 合成 Inbox 最小适配 | ⚠️ 可接受；impl-2 必替换 |

抽查：`stale-runs.ts`、`index.ts` recover→worker→sweeper、claim `lastHeartbeatAt`、journal `0007`。

## 给 impl-2 的注意点（不是新计划）

1. **表已在 0007** — 不要再开 migration（除非改列）；直接 writer + API。  
2. **删合成逻辑** — `routes/inbox.ts` 整段 comments+runs merge 换成真表；响应 **`{ items, unreadCount }`**（破数组契约，web 同改）。  
3. **钩子：** comment（非 status_change）/ run completed|failed / assign → `inbox-writer`；recipient 默认 `LOCAL_MEMBER`。  
4. **已有：** `toInboxItem`、`inbox:item` DomainEvent、真源 `InboxItem` 形状 — 复用勿另起炉灶。  
5. **UI：** read/archive、未读角标、ws invalidate `['inbox']` / `['inbox-unread']`。  
6. **回归：** issues / wiki/pages / memory/status；typecheck；handoff `bu01-impl-2.md`。  
7. worktree 继续 `.worktrees/bu01-reliability-inbox`；`git pull` 同分支最新后再干。

## 派 impl-2 时用的复制块

见下一条用户消息 / 或 `bu01-planner-0.md` 中 impl-2 块；以 **本文件注意点** 为准覆盖。

## 计划者本会话

- 只验收，未改业务代码（仅 handoff 验收栏 + 本文件）。  
- 下一步：等人派 impl-2 → 再验收 `bu01-impl-2.md` → 整刀可开 PR。

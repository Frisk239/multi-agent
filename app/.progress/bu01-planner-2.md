# Handoff: bu01-planner-2

> 切片：`补1` / `bu01` · 角色：`planner` · 序号：`2`（整刀验收）  
> 日期：2026-07-17

## 结论

**补1 整刀验收通过**（impl-1 可靠性 + impl-2 真 Inbox）。

| 棒 | 内容 | 状态 |
|---|---|---|
| impl-1 | heartbeat / stale / orphan + schema 0007 | ✅ 已验 |
| impl-2 | 落库 Inbox + API + UI + 角标 + 回归 | ✅ 本会话验 |

顶端（验收时）：`5246ead` 一带；分支 `feat/bu01-reliability-inbox` 已 push。

## 抽查摘要

- 真表 list/read/archive/unread-count；无 comments+runs 合成 merge  
- writer：`status_change` 过滤；`LOCAL_MEMBER`；dedupe  
- 钩子：comments / issues assign / run-worker / stale-runs fail  
- Web：`InboxListResponse`、角标、ws invalidate  
- typecheck 计划者复验全绿  

## 下一步（人 / 新会话）

1. **开 PR** `feat/bu01-reliability-inbox` → `main`  
2. **新会话 code review**（无上下文偏见）；计划者本会话不写业务代码  
3. 合 main 后更新补充阶段进度表：补1 ✅  
4. **补2** 另开计划（Agent/Squad 运营）；不要在本分支继续堆  

## 给 PR 审查的提示

- Breaking：`GET /api/inbox` 从数组 → `{ items, unreadCount }`  
- migration `0007` 一次性  
- 勿把 `wiki/`、`dev.db` 打进 PR  

## 计划者本会话

- 只填验收 + 本 handoff；未改业务实现。  

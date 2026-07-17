# Handoff: bu01-planner-0

> 切片：`补1` / `bu01` · 角色：`planner` · 序号：`0`（开工）  
> 日期：2026-07-17

## 分工（固定）

| 角色 | 会话 | 职责 |
|---|---|---|
| **计划者** | 本会话及后续计划者会话 | **只做**：计划、kickoff/验收 handoff、勾验收结论；**不做**实现代码 |
| **执行者** | 用户另派会话 | worktree 上按 plan 写代码、自测、写 impl handoff、push 分支 |
| **人** | — | 派会话、合 PR、最终人评 |

执行者交付后：把 `app/.progress/bu01-impl-*.md` 路径丢回计划者会话 → 计划者只读 diff/handoff/typecheck 证据做验收，再写下一棒注意点或整刀 PR 结论。

## 上下文

- **阶段：** 补充阶段（暂停前推后续切片）  
- **本刀：** 补1 = 能力包 **A 可靠性 + B 真 Inbox**  
- **spec：** [`docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md`](../../docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)  
- **plan（执行真源）：** [`docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md`](../../docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md)  
- **前置：** `origin/main` 已含 S12（合成 Inbox 等）  
- **分支：** `feat/bu01-reliability-inbox`  
- **建议 worktree：** `.worktrees/bu01-reliability-inbox`

## 执行棒划分

| 棒 | 计划 Task | 必须交付 |
|---|---|---|
| **impl-1** | Task 1–2 | migration `0007_…`；`last_heartbeat_at`；heartbeat；stale sweeper；orphan 收尸；shared `AgentRun.lastHeartbeatAt`；`stale-runs.ts`；启动接线 |
| **impl-2** | Task 3–5 | `inbox_item`/`subscriber` 若 impl-1 已建表则专注 writer+API+UI；落库 Inbox；钩子；read/archive；角标；回归 handoff |

**注意：** plan Task 1 含 inbox 表 + AgentRun 列；**建议 impl-1 做完 Task 1 整表迁移**（含 inbox 空表），impl-2 只写 writer/API/UI，避免两棒抢 migration。若 impl-1 只做 A 相关列、把 inbox 表留给 impl-2，必须在 impl-1 handoff **写清**，且 journal 只增一个 `0007`（不要拆两个 migration 除非必要）。

**默认：** impl-1 = **完整 Task 1 + Task 2**（schema 含 inbox 表但可暂无写入）。

## 给执行者 impl-1 的开工指令（可整段复制到新会话）

```
你是补1 执行者 impl-1。只做计划 Task 1–2，不要做 Inbox UI/writer。

必读：
1. AGENTS.md（补充阶段 + 工程模式）
2. docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md（Task 1–2 逐步做）
3. app/.progress/bu01-planner-0.md
4. references/deep/multica.md §2（stale/lease 思想，本地简化）

环境：
- git fetch origin && 从 origin/main 建分支 feat/bu01-reliability-inbox
- 建议 worktree：.worktrees/bu01-reliability-inbox
- 手写 drizzle SQL，不要依赖交互式 db:generate
- 不 commit wiki/ 运行目录、*.db；不 push main

交付：
- 完成 plan Task 1–2 所有 checkbox 等价物
- pnpm -r typecheck 绿
- 可靠性 smoke 证据写进 handoff
- 写 app/.progress/bu01-impl-1.md（模板 app/.progress/_TEMPLATE.md）
- push origin feat/bu01-reliability-inbox

做完后告诉人：请计划者验收 bu01-impl-1.md
```

## 给执行者 impl-2 的开工指令（impl-1 验收通过后用）

```
你是补1 执行者 impl-2。在 feat/bu01-reliability-inbox 上做 plan Task 3–5。

必读：
1. docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md Task 3–5
2. app/.progress/bu01-impl-1.md（计划者验收结论 + 注意点）
3. app/.progress/bu01-planner-0.md

约束：
- GET /api/inbox 改为 InboxListResponse（破 S12 数组契约，前后端同 PR）
- status_change 不进 inbox
- 默认 recipient = LOCAL_MEMBER
- 回归 issues/wiki/memory；不落 e2e 目录

交付：
- bu01-impl-2.md + typecheck + API/UI smoke
- push 同分支
- 请计划者做整刀验收
```

## 计划者验收清单（impl-1）

- [ ] 分支/worktree 正确，未污染 main  
- [ ] `0007_bu01_reliability_inbox.sql` + journal  
- [ ] claim 写 heartbeat；执行中 touch；sweeper + orphan  
- [ ] typecheck 绿；handoff 有命令输出  
- [ ] 无 wiki/ 误提交  

通过后：在 `bu01-impl-1.md` 填验收结论 + 给 impl-2 的注意点（新建 `bu01-planner-1.md` 可选）。

## 计划者验收清单（整刀 / impl-2 后）

见 plan Task 5 勾选 +：

- [ ] 合成 Inbox 逻辑已删除  
- [ ] read/archive/角标可用  
- [ ] 可开 PR（新会话 code review，计划者不写业务代码）

## 本会话（planner-0）完成了什么

- 确认补充阶段路线与补1 plan 已在 main（`9bcd1c9`）  
- 固定计划者 **只计划/handoff/验收**  
- 写出本 kickoff，供用户派执行会话  

## 自测结果

```
plan 文件存在：docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md
main：9bcd1c9 docs(bu01): 补1 实现计划
```

## 与计划的偏离

无。

## 遗留

- 等待 **impl-1** 会话交付 `bu01-impl-1.md`  
- 计划者届时只验收，不写实现  

## 验收结论（仅计划者填）

- 本文件为 kickoff，无实现可验收。  
- 结论：补1 **可以开工**；执行者按上文复制块启动。

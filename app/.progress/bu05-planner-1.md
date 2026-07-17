# Handoff: bu05-planner-1

> 切片：`补5` / `bu05` · 角色：`planner` · 序号：`1`（验收 impl-1）  
> 日期：2026-07-17

## 结论

**impl-1 验收通过。** 可派 **impl-2**（串行，同分支 `feat/bu05-automation`）。

| 项 | 结果 |
|---|---|
| 0010 + UNIQUE(rule_id, planned_at) | ✅ |
| createIssueCore + dispatch + tick | ✅ |
| REST + run-now + 幂等/失败路径 | ✅ |
| typecheck 复验 | ✅ |

顶端：`4e269a3` 一带，已 push origin。

## 给 impl-2 的注意点

1. API 已齐 — 只做 Task 4–5 UI，勿改 dispatch 语义。  
2. run-now 返回 **201 + AutomationRun**（failed 也 201）；UI 看 `status`/`issueId`/`error`。  
3. disabled 可 run-now；enabled 开关 PATCH。  
4. 侧栏/CmdK「自动化」icon=`automation`；`/automation`。  
5. seed：`agt-lead` demo。  
6. 勿 commit wiki/*.db；不 push main。

## 计划者

只验收 + 本文件。

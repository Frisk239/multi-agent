# Handoff: bu05-planner-0

> 切片：`补5` / `bu05` · 角色：`planner` · 序号：`0`（开工）  
> 日期：2026-07-17

## 分工

计划者只计划/验收；执行者实现；**串行** impl-1 → 验收 → impl-2。

## 真源

- **spec（已批准）：** `docs/superpowers/specs/2026-07-17-bu05-autopilot-design.md`  
- **plan：** `docs/superpowers/plans/2026-07-17-bu05-automation.md`  
- **分支：** `feat/bu05-automation`  
- **worktree：** `.worktrees/bu05-automation`

## 棒次

| 棒 | Tasks |
|---|---|
| impl-1 | 1–3 migration + dispatch + tick + REST |
| impl-2 | 4–5 `/automation` UI + 回归 |

## 给执行者 impl-1（复制块）

```
你是补5（bu05）执行者 impl-1。只做 plan Task 1–3，不做 Web UI。

必读：
1. AGENTS.md
2. docs/superpowers/specs/2026-07-17-bu05-autopilot-design.md
3. docs/superpowers/plans/2026-07-17-bu05-automation.md（Task 1–3）
4. app/.progress/bu05-planner-0.md
5. 现有 issues.ts create + enqueue 模式

环境：
- 从 origin/main 建 feat/bu05-automation
- worktree：.worktrees/bu05-automation
- migration 0010_bu05_automation.sql；不 push main；不 commit wiki/*.db

交付：
- automation_rule / automation_run + UNIQUE(rule_id, planned_at)
- dispatch + 30s tick + CRUD + run-now
- create_issue + 指派 enqueue；幂等；disabled 可 run-now
- typecheck + API smoke → bu05-impl-1.md
- push origin feat/bu05-automation

结束：请计划者验收 app/.progress/bu05-impl-1.md
```

## 给执行者 impl-2（impl-1 验收后）

```
你是补5（bu05）执行者 impl-2。做 plan Task 4–5。

必读 plan Task 4–5 + bu05-impl-1.md + bu05-planner-0.md。
同分支 pull；/automation 列表表单立即执行 + 侧栏/cmdk；回归 bu05-impl-2.md；push。
结束：请计划者整刀验收。
```

## 计划者验收（impl-1）

- [ ] 0010 + unique  
- [ ] run-now 建卡；二次 run-now 第二张卡  
- [ ] tick 注册；非法 assignee failed  
- [ ] typecheck + smoke  

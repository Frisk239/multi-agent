# Handoff: bu03-planner-0

> 切片：`补3` / `bu03` · 角色：`planner` · 序号：`0`（开工）  
> 日期：2026-07-17

## 分工

计划者只计划/验收；执行者实现；**串行** impl-1 → 验收 → impl-2。

## 真源

- **spec（已批准）：** `docs/superpowers/specs/2026-07-17-bu03-quick-create-design.md`  
- **plan：** `docs/superpowers/plans/2026-07-17-bu03-quick-create.md`  
- **分支：** `feat/bu03-quick-create`  
- **worktree：** `.worktrees/bu03-quick-create`

## 建议时机

- **优先：** origin/main 已含补2 再开做（roster + 更少冲突）  
- 若补2 未合：可先做，仅用 seed agent 验收，migration 号避开补2 的 0008（用 0009）

## 棒次

| 棒 | Tasks |
|---|---|
| impl-1 | 1–3 后端+CLI+worker |
| impl-2 | 4–5 UI+回归 |

## 给执行者 impl-1（复制块）

```
你是补3（bu03）执行者 impl-1。只做 plan Task 1–3，不做 Web UI。

必读：
1. AGENTS.md
2. docs/superpowers/specs/2026-07-17-bu03-quick-create-design.md
3. docs/superpowers/plans/2026-07-17-bu03-quick-create.md（Task 1–3）
4. app/.progress/bu03-planner-0.md
5. Multica 参考：references/repos/multica/server/internal/daemon/prompt.go buildQuickCreatePrompt（思想，勿抄 Go）

环境：
- git fetch；从 origin/main 建 feat/bu03-quick-create
- worktree：.worktrees/bu03-quick-create
- 手写 migration（issue_id 可空必须真实生效）；不 push main；不 commit wiki/*.db

交付：
- kind/quick_prompt/nullable issueId
- POST /api/quick-runs
- buildQuickCreatePrompt + worker 闸（无 issue 完成→fail）
- POST /api/issues origin link + M1 enqueue
- ma issue create
- typecheck + API smoke → app/.progress/bu03-impl-1.md
- push origin feat/bu03-quick-create

结束：请计划者验收 bu03-impl-1.md
```

## 给执行者 impl-2（impl-1 验收后）

```
你是补3（bu03）执行者 impl-2。做 plan Task 4–5。

必读 plan Task 4–5 + bu03-impl-1.md + bu03-planner-0.md。
同分支 pull 最新；QuickDispatch UI + cmdk/侧栏；ws null-safe；回归 handoff bu03-impl-2.md；push。
结束：请计划者整刀验收。
```

## 计划者验收（impl-1）

- [ ] DB issue_id 可空真实  
- [ ] quick-runs + QC prompt + worker  
- [ ] origin link + ma issue create + M1  
- [ ] typecheck + smoke  

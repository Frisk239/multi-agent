# Handoff: bu02-planner-0

> 切片：`补2` / `bu02` · 角色：`planner` · 序号：`0`（开工）  
> 日期：2026-07-17

## 分工

| 角色 | 职责 |
|---|---|
| **计划者** | 只做计划 / kickoff / 验收；**不写业务代码** |
| **执行者** | worktree 实现 + handoff + push `feat/bu02-roster-ops` |
| **人** | 派会话、合 PR |

## 上下文

- **厚切片：** 包 **C Agent 运营 + D Squad 运营**（用户要求每刀做厚）  
- **plan：** [`docs/superpowers/plans/2026-07-17-bu02-roster-ops.md`](../../docs/superpowers/plans/2026-07-17-bu02-roster-ops.md)  
- **spec：** 补充阶段 [`…phase4b-product-supplement-design.md`](../../docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)  
- **前置：** main 已含补1（PR #12）  
- **分支：** `feat/bu02-roster-ops`  
- **worktree 建议：** `.worktrees/bu02-roster-ops`

## 棒次（串行）

| 棒 | Tasks | 交付 |
|---|---|---|
| **impl-1** | 1–3 | migration `0008`、Agent/Squad **全部** REST、readiness、runs、prompt instructions |
| **impl-2** | 4–6 | Agents/Squads **运营 UI**（新建/编辑/删除/Runs/Instructions/readiness）、回归、可开 PR |

## 给执行者 impl-1 的复制块

```
你是补2（bu02）执行者 impl-1。厚切片：只做 plan Task 1–3（API/schema/prompt），不做 Web UI。

必读：
1. AGENTS.md
2. docs/superpowers/plans/2026-07-17-bu02-roster-ops.md（Task 1–3 逐步做）
3. app/.progress/bu02-planner-0.md
4. 现有 roster.ts / squad-loader.ts / prompt.ts / AgentDetailPage（只读了解，勿改 UI）

环境：
- git fetch；从 origin/main 建 feat/bu02-roster-ops
- worktree：.worktrees/bu02-roster-ops
- 手写 0008 migration；不 push main；不 commit wiki/*.db

交付：
- Agent POST/PATCH/DELETE + readiness + runs
- Squad POST/PATCH/DELETE + memberIds 替换
- buildPrompt 注入 instructions（顺序见 plan）
- pnpm -r typecheck 绿 + API smoke 进 handoff
- app/.progress/bu02-impl-1.md
- push origin feat/bu02-roster-ops
结束：请计划者验收 bu02-impl-1.md
```

## 给执行者 impl-2 的复制块（impl-1 验收后）

```
你是补2（bu02）执行者 impl-2。做 plan Task 4–6（Web + 回归）。

必读：
1. docs/superpowers/plans/2026-07-17-bu02-roster-ops.md Task 4–6
2. app/.progress/bu02-impl-1.md（计划者验收 + 注意点）
3. app/.progress/bu02-planner-0.md

环境：同分支 feat/bu02-roster-ops，pull 最新后再干。

交付：
- Agents/Squads 新建编辑删除 UI
- Agent：readiness chip、Runs Tab、Instructions 可写（消灭 Placeholder）
- Squad：protocol/directive/leader/members 可编辑
- typecheck + 指派 smoke；bu02-impl-2.md；push
结束：请计划者整刀验收 bu02-impl-2.md
```

## 计划者验收清单（impl-1）

- [ ] 0008 + instructions 列  
- [ ] Agent/Squad CRUD 齐；409 规则  
- [ ] readiness / runs  
- [ ] prompt 注入顺序正确  
- [ ] typecheck + smoke  
- [ ] 无 UI 半残要求（本棒可以不改 web，但 shared 变更不得弄红 web；若 shared 破前端，最小适配可接受）

## 本会话

- 写出厚补2 plan + kickoff  
- 等人派 impl-1  

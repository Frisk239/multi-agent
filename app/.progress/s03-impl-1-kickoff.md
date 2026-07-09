# S03 impl-1 启动提示词（复制代码块到新会话）

```markdown
你是 S03 的 **impl-1 执行者**。只做 shared 契约 + DB（agent.runtime / agent_run / run_message）+ seed + reshape。
不要写 RuntimeBackend、Worker、前端。

## 仓库
D:\code\multi-agent · 分支从 main 开 `feat/s03-runtime-backend`

## 必读
1. AGENTS.md
2. app/.progress/s03-planner-1.md
3. docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md §3–§4
4. docs/superpowers/plans/2026-07-09-s03-runtime-backend.md 片段 A Task 1.1–1.4
5. design/borrow-from-references.md（抄自 G-TASK-ROW 等）

## 硬约束
- 三 runtime：claude-code / opencode / cursor
- seed：agt-lead→claude-code，agt-research→opencode，agt-prd→cursor
- UpdateIssueInput 含 assignee；DomainEvent 含 run:*
- 删 dev.db* 后 migrate+seed
- 完成后写 s03-impl-1.md，push 分支，**停，等计划者验收**

## DoD
pnpm -r typecheck 绿；migration 0002；seed agents 有 runtime；handoff 完整
```

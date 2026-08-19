# Slice Spec: followup-serial-claim

日期：2026-08-19  
主目标：编排正确性（不新建 Goal，不触碰 G8-4b 禁开项）

## 用户路径

某 Agent 正在处理一个 Issue 时，操作者补充一条评论。控制台建立一条 follow-up run，并明确显示它在等待当前同 Agent、同 Issue 的 run；即使该 Agent 的并发上限大于 1，follow-up 也绝不与前一轮同时执行。前一轮进入终态后，follow-up 被正常领取；其他 Agent 仍能在同一 Issue 上并行执行。

## Must

1. **Claim 原子守卫**：在 worker 的领取路径中，用 DB 条件/查询守卫同 `(issueId, agentId, kind=issue)` 的活跃 run（`dispatched`、`running`、`waiting_local_directory`）；不只依赖 enqueue 去重或内存互斥。
2. **不饿死队列**：被同 scope 阻塞的 follow-up 保持 queued，worker 仍可领取同 Agent 的其他可运行任务；前一 run 终态后下一个 tick 能恰好领取 follow-up。
3. **可见且诚实**：Runs API 的观察投影与至少一个实际 UI surface 显示“等待当前同 Issue run”及阻塞 run，不伪装成通用 runtime busy；现有 path-lock 等待说明保持兼容。
4. **回归网**：真实 DB/worker 测试覆盖 concurrency=2 的阻塞、前一 run 终态后的接续、不同 Agent 可并行，以及现有 comment follow-up/rerun/path-lock/priority 语义不回退；Playwright 覆盖从 Issue 评论到可解释的 queued follow-up（或说明所用确定性 fixture）。

## Out

- 跨 Issue 串行、全局 mutex、文件锁/worktree、mid-run stdin 注入。
- 改 Agent 总并发、运行状态机枚举、G8-4b adapter probe、云/daemon 协议。
- 把 Runs Mission Control 的标题/项目搜索并入本刀（下一候选）。

## 参考与决策

- 学 Multica 在 claim SQL 中以 `NOT EXISTS` 保护同 Agent × scope，而不是在 enqueue 时乐观假设；见 `references/repos/multica/server/pkg/db/queries/agent.sql:508-539`。
- 本仓已完成 `comment-followup-queue`，但 closeout 明确记录 concurrency>1 时可能并行；见 `app/.progress/comment-followup-queue-impl-1.md`。
- 选择在读取投影上提供原因，优先复用本仓 `pathWaitReason/pathBlockedByRunId` 的诚实表达，不为该提示引入新的持久状态。

## 验收

- `pnpm check`、`node scripts/check-docs.mjs`。
- server 定向 worker/claim 回归 + `pnpm e2e --filter <新增脚本>`（服务可用时不得把 SKIP 当 PASS）。
- Playwright CLI 走 Issue → 评论 → queued follow-up → 等待说明；必要时结合确定性测试 DB。

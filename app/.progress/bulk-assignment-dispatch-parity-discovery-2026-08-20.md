# Discovery: bulk-assignment-dispatch-parity

日期：2026-08-20
状态：已选定下一刀

## 结论

看板的批量“更改指派”目前只改 Issue 的多态指派列与 activity，用户看到的是“已更新 N 项指派”，却没有任何 run 被排入队列，也没有说明为什么不能启动。它是比单条派活更危险的静默失真：一次可让多张卡看起来已交给 Agent，实际无人接手。

## 证据与参考

- 本仓 UI 入口在 `app/packages/web/components/KanbanBoard.tsx:984-1030`，hook `app/packages/web/lib/api/issues.ts:785-826` 只乐观更新卡片与成功 toast。
- 本仓 `POST /api/issues/bulk-assign` 只在事务中 UPDATE/activity：`app/packages/server/src/routes/issues.ts:1142-1174`；它没有目标 readiness、`issue:updated`、通知、enqueue/wake 或可解释返回。单条 `PUT /api/issues/:id` 的相邻路径却具备 readiness/preflight、event 与 enqueue：`app/packages/server/src/routes/issues.ts:690-815`。
- Multica batch issue update 复用同一条 `validateAssigneePair → WillEnqueueRun → dispatchIssueRun` 决策链，避免 batch 路径自行漂移：`references/repos/multica/server/internal/handler/issue.go:3432-3473`。

## 选项与决定

1. 只改 toast 文案：不修复真实派活，排除。
2. 在 bulk handler 复制单条的全部副作用：短期可跑但必然漂移，排除。
3. **选定：提取共享的目标校验/派发决策，bulk 在事务后逐项调用；事务只做全批变更与 activity。** 批量 response 汇总 changed/enqueued/skipped 的理由，Web toast 据此诚实显示；每个已变更 Issue 广播 `issue:updated`。

## 关键边界

- 批量不会调用 `cancelActiveRunsForIssue`：已有任意 Agent 的 running/queued run 不被这次改指派隐式取消。若 enqueue 因去重、容量或 readiness 被跳过，返回原因即可。
- 本刀只保持单条现有的 target/readiness 口径；归档 Agent/Squad 的生命周期定义另列候选，避免把两件事混在一个事务里。
- 不改 status、priority、全局并发、批量 retry、run 状态机或队列算法。

## 验收轮廓

- 真实 SQLite/Fastify：两张 todo Issue 批量指派至可运行 Agent → 两条 queued run；无效 target 或无 leader 的 squad 在写入前原子拒绝；已有另一 Agent 的 active run 保留。
- Web：多选两张卡 → 指派 → toast 给出变更/入队/跳过真相；Runs 或 Issue 读模型可找到两条结果。
- Playwright：随机隔离 fixture + 非默认端口/DB，断言从看板的多选路径到真实 run，且不启动 CLI。

# Discovery: archived-agent-dispatch-fence

日期：2026-08-20
状态：已选定下一刀

## 结论

本仓的 Agent 软归档目前只是写 `archivedAt`：PATCH 甚至可绕过 DELETE 对 active run 的检查。readiness、enqueue 与 worker claim 都不把归档当硬闸，因此已经“归档”的 Agent 仍可能收到新 queued run 或执行已有 queued run。这使 UI 的“归档”承诺失真。

## 证据与参考

- PATCH/DELETE 的生命周期不一致：`app/packages/server/src/routes/roster.ts:276-329`。
- `computeAgentReadiness` 只看 runtime/cwd/槽位：`app/packages/server/src/orchestration/readiness.ts:23-150`；`checkAndEnqueue` 只检查是否存在：`app/packages/server/src/orchestration/run-service.ts:260-396`；worker 能 claim archived agent 的 queued 行：`app/packages/server/src/orchestration/run-worker.ts:132-272`。
- Issue/bulk、quick-run、automation、subagent、auto-retry 最终都会落入上述 enqueue/worker 链；chat 已正确在写消息前拒绝 archived Agent：`app/packages/server/src/routes/chat.ts:312-315`。
- Multica 把 `archived_at` 放进统一 Agent readiness 的首道 gate：`references/repos/multica/server/internal/service/agent_ready.go:9-42`；归档同时取消该 Agent pending/active task，但保留记录：`references/repos/multica/server/internal/handler/agent.go:1965-2011`。

## 选项与决定

1. 只从 UI picker 隐藏：无法阻止 API、automation 或旧 queued run，排除。
2. 每个入口分别加 archive check：漏口必然再出现，排除。
3. **选定：归档生命周期统一写入 + 中心 enqueue/readiness gate + worker 条件 guard。** 归档后取消未完成 run、保留 Issue/Run/聊天审计；任意新入口统一得到 `agent_archived` 解释。PATCH 与 DELETE 收敛到同一操作。

## 关键边界

- `MA_ENQUEUE_ALLOW_NOT_READY` 只能绕过宿主 runtime/cwd 探测，绝不能绕过归档。
- 归档是显式停止工作操作：取消须复用现有 transition/abort/event 路径，不能裸 SQL；deferred 也必须不能在稍后复活。
- 不做 Agent hard-delete 重构、fallback 自动改派、Squad 退役迁移或 G8-4b probe。

## 验收轮廓

- 隔离 DB 插入 concurrency=0 Agent 与 queued/deferred/running run，PATCH/DELETE 任一路径归档后都成为 cancelled，历史仍可读。
- Issue/bulk/rerun/quick-run/automation/subagent/auto-retry 的新派发统一返回 `agent_archived`/skipped，无新 AgentRun；worker 旧快照无法 claim CLI。
- UI/readiness 显示归档状态，Automation Run Now 给真实 skip 解释；解除归档后保持既有正常派发。

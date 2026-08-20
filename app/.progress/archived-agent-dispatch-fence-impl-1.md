# Closeout: archived-agent-dispatch-fence

日期：2026-08-20
产品提交：`ce0f401 feat(agents): fence archived dispatch`

## 已交付

- `agent_archived` 成为统一的生命周期派发闸，优先于 runtime/cwd readiness 与 `MA_ENQUEUE_ALLOW_NOT_READY`。Issue enqueue/leader、批量或单条改指派、Quick Run、Automation run-only、subagent、自动重试/改派、Chat 的新 thread 与发消息都返回同一可解释原因，避免生成新的 AgentRun。
- `PATCH { archived: true }` 与软 `DELETE` 收敛到一个 archive lifecycle：先写 `archivedAt`，再复用条件 transition + abort + `run:cancelled` 事件取消 queued、waiting_local_directory、deferred 和 running；重复归档仍会扫遗留行。unarchive 只允许未来入队，永不复活 cancelled 历史。
- worker 在 queued/waiting → running 的同一条件 UPDATE 中加 Agent 未归档 `EXISTS` guard；旧快照遇到归档队列会可观测地取消。prepare/prompt 与最终 `backend.execute` 前也复核状态/AbortSignal，覆盖归档和 claim/准备阶段的竞态。
- UI 将归档呈现为中性“已归档”而非 runtime 故障；Agent 详情保留历史入口、禁用私信和“分配工作”，提供恢复；Assignee、Quick/Issue toast 与 Automation Run Now 都显示真实 skip/恢复路径。Automation 仍可点“立即执行”以写入 skipped 审计，绝不伪称启动。

## 参考与决策

- 对齐 Multica 的统一 agent-ready archive gate：`references/repos/multica/server/internal/service/agent_ready.go:9-42`；归档时取消 pending/active task、保留历史的语义：`references/repos/multica/server/internal/handler/agent.go:1965-2011`。
- 本仓采用“先封住未来派发、再走既有取消原语”的窄实现，不引入新队列、daemon 或 fallback 重定向。worker 使用同一 SQL claim 条件作最终并发边界，避免把 UI/API 预检误当成安全保证。

## 验收证据

- 真实 SQLite/Fastify 契约覆盖 PATCH/软 DELETE 的四种未完成状态、重复收口、历史可读、单条/批量 preflight、Quick 409、Automation Run Now skipped、unarchive 后新 queued，以及 Chat 直插拒绝。
- Owner 用新 migrated+seed 的隔离 SQLite 实跑 current-source Playwright：Server `:3134`、Web `:3135`；浏览器归档后取消 queued/waiting/deferred/running，Quick 被 `agent_archived` 拒绝，Automation 留 skipped 审计且零 AgentRun/CLI，unarchive 后历史仍 terminal、新 Quick Run 保持 queued（Agent concurrency=0）。服务已停止。
- Owner 全量 `pnpm test` 通过：shared 133 tests、server 125 files / 1081 tests、web 82 files / 576 tests。shared/server/web direct TypeScript、E2E 脚本静态 TypeScript、`node scripts/check-docs.mjs` 与 `git diff --check` 均通过。

## 边界 / 工具链注记

- 不改 hard delete、Squad 退役、自动 fallback、状态机或 scheduler；新建 Issue 保持既有可审计创建语义，但中心 enqueue 如实返回 `agent_archived` skip 且不建 run。
- `pnpm typecheck` 的 Web 裸 `tsc` link 仍是既有 workspace 工具链问题；本刀用仓内 TypeScript 显式检查 Web tsconfig，未扩大依赖修改。
- 两个 `e2e` 临时运行目录因执行器拒绝递归删除而留在 `.scratch/archived-agent-dispatch-fence/`，未 stage/commit；随机 fixture 已由脚本 finally 清理。

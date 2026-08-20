# Spec: archived-agent-dispatch-fence

日期：2026-08-20
状态：实施中
上一刀 Closeout：`app/.progress/bulk-assignment-dispatch-parity-impl-1.md`
调研：`app/.progress/archived-agent-dispatch-fence-discovery-2026-08-20.md`

## 用户路径

操作者归档一个 Agent 后，控制台明确显示它已归档；该 Agent 的 queued、waiting、deferred 与 running 工作被现有取消机制诚实收口，但 Issue、Run、聊天和审计仍可查看。随后从 Issue、看板批量、Quick Run 或 Automation 再尝试派给该 Agent 时，页面返回“智能体已归档”的真实原因，不创建新 run；任何 worker 旧快照也不能启动 CLI。解除归档后，现有正常派活链路可恢复。

## 调研与决策

- 归档列已存在，但 PATCH 与 DELETE 生命周期不一致，且 readiness/enqueue/worker 不了解 `archivedAt`：见 discovery。
- Multica 把 archive 放进统一 ready gate，并在 archive 时停止该 Agent 的未完成 task，历史继续留存。
- 选定：使用唯一 `agent_archived` gate（不能被 `MA_ENQUEUE_ALLOW_NOT_READY` 绕过）和一个统一 archive lifecycle。派发入口优先从中心 `enqueue` 得到可解释 skip；worker 另有原子 guard，覆盖 archive 与 claim 的竞态。

## Must

1. 扩展共享可解释状态/skip reason，使 `computeAgentReadiness`、`enqueueAgentRun`/leader enqueue、API 回执与 UI 都能表达“智能体已归档”。归档检查优先于 runtime/cwd bypass，`MA_ENQUEUE_ALLOW_NOT_READY` 不得绕过。
2. `PATCH /api/agents/:id { archived: true }` 与软 `DELETE /api/agents/:id` 收敛到同一归档生命周期：幂等写 `archivedAt`，通过现有条件 transition/abort/event 路径取消该 Agent 所有未完成 `queued`、`waiting_local_directory`、`deferred` 与 `running` run；不删除 Agent、Issue、Run、聊天、activity 或 memory。unarchive 仅清 `archivedAt`，不复活已取消 run。
3. 所有新派发最终经中心 gate 返回 `agent_archived`，至少覆盖 Issue 单条/批量、rerun、Quick Run、Automation、subagent/mention 与 auto-retry；不能只靠 UI 或某条 route。Run worker 在 claim 同一 DB 条件中确认 Agent 未归档；发现已归档旧队列时以可观测取消收口，绝不执行 CLI。
4. UI/readiness 显示“已归档”而非 runtime 缺失/忙碌；Automation Run Now 对 archived run-only target 显示领域 skipped/reason，不把 HTTP 成功误写成已启动。Agent 详情的未来派活 CTA 不得继续提供假成功。
5. 真实 SQLite/Fastify、worker race/transition、Web 的 API/状态文案测试；隔离 current-source Playwright 用随机 `concurrency=0` fixture 验证归档收口、历史保留、Automation/手动路径拒绝、unarchive 后正常可排队。非默认端口与 `e2e` DB、CORS guard、禁 CLI、finally 清理。

## Out

- 不做 Agent hard-delete 重构、fallback 自动改派、Squad archive/transfer、批量归档、恢复已取消 run、G8-4b 真 probe 或新的运行时。
- 不重写 run 状态机、worker 架构、scheduler、全局并发或聊天删除策略。

## 验收

- 归档前已有 queued/waiting/deferred/running run 时，PATCH 与 DELETE 任一归档入口均只保留 cancelled 历史，running 使用现有 abort/event 语义；重复 archive 幂等。
- 归档 Agent 的 Issue/bulk/rerun/quick/automation/mention/auto-retry 不能新增 run，收到统一可解释 `agent_archived`；worker 的 archive/claim race 不能到 execute/CLI。
- 前端不把归档 Agent 说成“就绪/忙碌”，Automation Run Now 显示 skip 原因；unarchive 后可正常创建 queued run。

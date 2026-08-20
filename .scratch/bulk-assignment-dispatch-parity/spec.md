# Spec: bulk-assignment-dispatch-parity

日期：2026-08-20
状态：实施中
上一刀 Closeout：`app/.progress/automation-skipped-streak-drilldown-impl-1.md`
调研：`app/.progress/bulk-assignment-dispatch-parity-discovery-2026-08-20.md`

## 用户路径

操作者在看板勾选两张待办卡，选择一个可用 Agent 或 Squad。提交后每张已实际变更的卡都会像单条改指派一样获得一次真实的派发决策：可入队时出现 queued run；无法启动时 response/toast 明确给出原因。卡片上的“已指派”不再是假象，且原先正在运行的工作不会被批量操作暗中取消。

## 调研与决策

- 本仓 batch handler 只更新 `assignee_type/id` 与 activity，单条 handler 才做 readiness、event、notify 和 enqueue：见 discovery。
- Multica 的 batch update 复用 `validateAssigneePair → WillEnqueueRun → dispatchIssueRun`，而不是另写一个漂移的批量路径。
- 选定：将单条与批量共享“目标校验 + 单 Issue 派发”决策。bulk 先全量 preflight，再在一个事务内改写所有变更卡与 activity；事务后逐张广播并派发，返回可汇总的真实结果。

## Must

1. `POST /api/issues/bulk-assign` 在任何写入前验证整个目标指派对，沿用单条当前的存在性、squad leader 与 readiness 口径；非法目标/无 leader/readiness 失败时 4xx 且零 Issue/activity/run 半写。未指派保持合法且不派活。
2. 对每张实际发生身份变化的 Issue，在事务内更新指派和 activity；事务后发布 `issue:updated`，并通过共享派发决策通知/入队或记录结构化 skip reason。相同指派的 Issue 不重复派活。
3. 响应至少给出 `updatedCount`、`enqueuedCount` 与可解释的 skipped 汇总/明细；Web hook 的 toast 明确区分“已改指派”“已入队”与“未启动原因”，不把 HTTP 成功说成全部已开工。保持现有 URL、多选和乐观更新/失效策略。
4. **批量改指派不得隐式取消任何 active run**，包括被改卡上另一 Agent 的 queued/running run；本刀不得调用或借道 `cancelActiveRunsForIssue`。单条改指派的既有取消语义不在本刀重定义。
5. 增加真实 SQLite/Fastify 契约与 Web hook/看板测试；隔离 current-source Playwright 从多选卡片走到真实 queued run/可解释结果。E2E 必须随机 fixture、非默认端口与 `e2e` DB、禁 CLI、finally 清理。

## Out

- 不改变 Issue status/priority/position、run 状态机、per-agent 或全局并发、批量 retry/取消、队列优先级或 scheduler。
- 不重做 archive Agent/Squad 的生命周期定义，也不顺带改变单条改指派的取消语义。
- 不做新的批量详情页、后台 job、无限历史或 Runs UI 重构。

## 验收

- 两张 todo Issue 批量指派给就绪 Agent 后，API 返回两项变更与两项入队，DB/`/api/runs` 有两条对应 queued run，且 `issue:updated` 对每张已改卡可观察。
- 不存在 target、无 leader squad 或 readiness 失败时，整个批次保持原指派、无 activity 和无 run；unassign 不创建 run。
- 某张卡已有另一 Agent 的 active run 时，批量指派仍可为新目标产生自身的派发结果，但旧 run 不被取消。
- 看板多选后 toast 真实区分入队与 skip；隔离浏览器路径验证不触发 worker/CLI。

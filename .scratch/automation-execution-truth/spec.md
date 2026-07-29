# Automation execution truth

Status: done

## 用户路径

本地操作员触发 Automation 后，在自动化记录中看到 linked Issue/Run 的真实执行状态；若 runtime/cwd 暂不可用，记录明确显示待派发而不是成功，环境恢复后可幂等补派一次，并继续观察到最终成功或失败。

## Must

1. `automation_run` 表达建卡、待派发、运行中与最终成功/失败，兼容现有历史记录。
2. Automation 创建 Issue 但 enqueue skipped 时不得写 `success`；持久化 skipped reason 与 linked Issue。
3. linked `agent_run` 进入 running/terminal 时，使用条件更新幂等同步 origin automation run；rule fail count 只基于最终 terminal。
4. 提供恢复动作：操作员可对待派发记录执行 reconcile；重复请求至多补派一个 Run。
5. Automation UI 展示真实状态、原因、Issue/Run 深链与恢复 CTA；WebSocket 或 query invalidation 后可见状态推进。
6. unit/integration 覆盖 skipped ≠ success、terminal 同步、重复 reconcile 幂等；Playwright 覆盖待派发 → 恢复 → 运行/最终状态路径。

## Out

- webhook、daemon/心跳协议 1:1、Redis、多节点。
- 无限重试或 auth/config/cwd_missing 自动重试。
- 复杂自动暂停策略。
- 密钥入库。
- 本刀不做通用 infra 指数退避；作为紧随其后的独立厚切片评估。

## 参考与约束

- Multica `references/repos/multica/server/internal/service/autopilot.go:101-113,1048-1105`
- Multica `references/repos/multica/server/internal/service/task.go:3147-3249`
- 本仓 `app/packages/server/src/orchestration/automation-dispatch.ts:222-274`
- 本仓 DB 行即锁：条件 `UPDATE ... WHERE status IN (...)`
- 纯本地、单主进程；不新增 daemon/Redis。

## 验收

- `pnpm typecheck`
- 聚焦 unit/integration tests
- fresh DB migration test
- Playwright CLI：Automation 记录的状态、原因、reconcile 与 Issue/Run 深链
- progress closeout + commit/push `main`

# Automation linked Run retry convergence closeout (2026-07-30)

## Verdict

通过。Automation 规则生成的 Issue Run 现在复用 bounded infrastructure auto-retry；只要 retry lineage 仍有 active child 或刚刚排队，Automation execution truth 保持 `retrying`，直到 child 成功或预算耗尽。

## Research basis

- Multica `references/repos/multica/server/internal/service/autopilot.go:1048-1110`：linked Issue task 失败先查询 active retry，等待 lineage terminal 后才失败 autopilot run；本仓采用同样的等待语义，但保留本地 SQLite + Backend adapter。
- Pi `references/repos/pi/packages/ai/src/utils/retry.ts:7-96`：瞬时网络/服务错误进入重试，认证/配额保持人工处理；本刀复用上一刀 allowlist，不放宽失败分类。
- 本仓原缺口：`automation-execution.ts` 原先任意 `run:failed` 直接终止，`auto-retry.ts` 原先显式排除 automation Issue。

## Delivered

- Automation-origin Issue Run 允许进入既有 bounded retry policy；allowlist、attempt/max、退避、唯一 lineage guard 不变。
- AutomationRun 增加 `retrying` contract；事件同步识别 parent scheduled、active child、以及同 Issue 的后代 active retry，避免迟到 parent failure 把执行真相降级为 failed。
- child 成功后才写 success；预算耗尽/不可重试失败写 failed；terminal 状态仍由条件更新保护，不接受迟到事件覆盖。
- Automation 页面将状态翻译为中文，展开最近执行可看到“自动重试中”、当前 child Run 深链与下次提示；规则最近状态也使用同一标签。

## Evidence

- `pnpm typecheck`：shared/server/web 全部通过。
- focused tests：automation execution + auto-retry + failure classifier 共 46 tests passed；此前 infra slice 74 tests 继续通过。
- fresh SQLite + real API/Playwright：Automation 页面展开“最近执行”显示“自动重试中”，Issue/Run 深链指向 `auto-live-child`；浏览器业务 console 0 errors（仅开发环境 warning）。
- race tests 覆盖：parent retrying 不被迟到 failure 降级、child success terminal、child 预算耗尽 failure。

## Next slice candidates

1. Disaster recovery：SQLite + Wiki manifest/restore 的真实演练、校验与 Settings 运维入口。
2. Retry lineage terminal reason / queue delay 的统一 API 与跨页面可操作反馈。
3. 继续对照 Multica 收尸/恢复路径，验证服务重启后 retrying Automation 不丢状态。

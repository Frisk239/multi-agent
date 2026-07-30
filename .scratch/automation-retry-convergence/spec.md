# Automation linked Run retry convergence

Status: done

## User path

Automation 规则生成的 Issue Run 因可恢复基础设施故障失败时，系统应沿用 bounded auto-retry，Automation execution truth 保持“自动重试中”，直到 retry lineage 最终成功或预算耗尽；不可恢复失败仍立即进入 failed。

## Must

1. Automation-origin Issue Run 允许复用 bounded auto-retry allowlist、预算、退避与唯一 lineage guard。
2. linked Run 的 parent/child 失败事件若已排入 active/due retry，不得把 automation execution truth 提前写成 failed；应暴露 retrying 状态和当前 child Run。
3. retry child 成功后 automation 才 success；重试预算耗尽或不可重试原因才 failed；迟到 parent 事件不可覆盖 terminal。
4. shared/API/reshape/DB status contract 增加 `retrying`，Automation 页面显示中文状态、当前 linked child 深链与原因/下次时间。
5. 补齐单测：allowlist automation、parent retrying 不终止、child success/final failure、terminal race；真实 fresh DB + Playwright 验收 Automation 页面。

## Out

- 不引入 webhook/daemon/Redis；不改变 manual retry API。
- 不做无限重试、auth/quota 自动重试；不重写 Automation 调度器。

## Research basis

- Multica `references/repos/multica/server/internal/service/autopilot.go:1048-1110`：linked Issue task 失败先检查 active retry，等待 lineage terminal 后再 fail。
- Pi `references/repos/pi/packages/ai/src/utils/retry.ts:7-96`：仅瞬时网络/服务错误进入重试，认证/配额排除。
- 本仓 `app/packages/server/src/orchestration/automation-execution.ts:31-76`：当前任意 failed event 直接终止；`app/packages/server/src/orchestration/auto-retry.ts:35-48`：当前显式排除 automation。

# Issue/Squad execution log closeout — 2026-07-30

## Verdict

完成一条前端高频恢复路径：Issue 与 Squad 详情不再只是“状态 + 时间线按钮”，而是可直接定位在途耗时、停止当前 run、重试具体历史 run，并进入 transcript 运行页。

## Research and decision

- Multica `references/repos/multica/packages/views/issues/components/execution-log-section.tsx:91-166` 先分 active/past；`251-357` 对 running 显示 live elapsed、提供 stop/transcript；`365-430` 对 failed/cancelled 按原 task 定向 retry。
- 本仓已有安全操作 API：`app/packages/server/src/routes/runs.ts:135-155` messages、`:172-199` cancel/retry；因此不重复造后端状态机，前端复用既有 DB 行闸和原 run id。
- 现有 UI 缺口证据：原 `IssueRunHistory.tsx:156-217` 只有行选择/时间线，原 `SquadRunsTimeline.tsx:138-198` 只有状态/角色/Issue/时间，只有 escalation 特例可重试。

## Delivered

- `app/packages/web/components/IssueRunHistory.tsx`
  - active/past 分组；active 1 秒 live elapsed；active 停止；failed/cancelled/timed_out 定向重试；时间线与运行页 transcript 深链。
- `app/packages/web/components/SquadRunsTimeline.tsx`
  - active/past 分组；active elapsed；active 停止；terminal 定向重试；每行运行页入口；保留 escalation alert。
- `app/packages/web/components/IssueDetail.tsx`
  - Issue 有 active run 时启用 runs 2.5 秒轮询。
- `app/packages/web/lib/api.ts`
  - `useRuns` / `useWorkspaceRuns` 增加 `refetchActive`，无 active 时自动停止轮询。
- `app/packages/web/app/globals.css`
  - execution log group heading 和 Squad action 列样式。
- Tests
  - `IssueRunHistory.test.tsx`：分组、elapsed、cancel、retry、transcript。
  - `SquadRunsTimeline.test.tsx`：分组、elapsed、cancel、retry、transcript。

## Evidence

- `pnpm typecheck`：shared/server/web 全通过。
- `pnpm test`：shared 90、server 357、web 208，共 655 tests 通过。
- Playwright 临时 seeded DB：Issue 详情真实显示“在途 · 1 / 已运行 2m 23s / 停止 / 时间线 / 运行页”和“历史 · 1 / 重试此 run”；点击停止后该 run 进入历史并显示“取消”，无业务 console error。

## Remaining hard gaps

- 后端仍缺统一 queue-age sample/terminal reason 聚合 API；当前靠 run 行时间戳和既有 retry/cancel API。
- Issue/Squad 仍缺 inline transcript 内容预览（现在是时间线/运行页深链）。
- 灾备 live swap 仍需 maintenance gate、active-run recovery、rollback journal 和 project Wiki mapping。

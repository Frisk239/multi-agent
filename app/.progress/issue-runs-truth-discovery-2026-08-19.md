# Issue runs truthful state discovery（2026-08-19）

## 结论

`IssueDetail` 与 `RunStatusBar` 当前各自调用 `useRuns`；两处都把 `data` 缺失默认成 `[]`。因此 `/api/runs?issueId=…` 最终失败时，状态栏走到 `run-status-empty` 并声称「指派 agent 后自动执行」，摘要也会显示「尚未执行」。这是前端 query-state 丢失，不是 run 状态机或后端数据问题。

## 最小方案

- `IssueDetail.tsx:261` 作为唯一 `useRuns(id, { refetchActive: true })` 所有者，向 `RunStatusBar` 传 data/loading/error/refetch；后者不再独立请求。
- `RunStatusBar.tsx:28-55`：loading 显示加载态；error 显示局部 `ErrorState`（`运行状态暂不可用`）和同一 query 的 `refetch`；只有成功且空才显示原有「指派 agent 后自动执行」。
- `IssueDetail.tsx:814-820` 摘要在 loading/error 时明确「加载中／运行状态暂不可用」，避免折叠区仍伪装为尚未执行。
- 保留 active polling、stop/rerun/retry run、transcript/history、页面 ErrorBoundary；“重试加载”只调用 query refetch，绝不新建 run。

## 参考

- Multica `packages/ui/components/common/error-boundary.tsx:27-34,49-76,80-96` 适合隔离 render error，但不会处理 TanStack Query 异步拒绝，也不会调用 refetch。
- Multica `packages/views/issues/components/execution-log-section.tsx:70-75,111` 同样将 data 默认 `[]`，不能照搬这一缺口。
- Multica `packages/views/agents/components/tabs/skills-tab.tsx:237-273` 显式 `isLoading/isError`，Refresh 调同一 query 的 `refetch()`；可借鉴。

## 验证

- Web component / IssueDetail 断言：error 不出现 `run-status-empty`，retry 调同一 `refetch`，成功空才出现旧空态。
- Playwright 仅拦截目标 Issue 的 GET `/api/runs` 为 500：Issue 基本字段仍可用；展开运行区显示错误与重试；恢复拦截后点击重试显示真实 run 或真实空态。

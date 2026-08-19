# Closeout: issue-runs-truthful-error-state

日期：2026-08-19

## 交付

- 实现提交：`ca2aabe fix(issue): show runs query failures`
- `IssueDetail` 成为一个 Issue 的唯一 `useRuns(id, { refetchActive: true })` 所有者；运行摘要、状态栏、历史消费同一 query state，不再由状态栏另开查询并把缺失数据降为 `[]`。
- `/api/runs?issueId=…` 最终失败时，摘要显示「运行状态暂不可用」，展开区显示局部 `ErrorState` 与同一 query 的 retry；loading 明示「正在加载运行状态…」。仅成功且确实为空时保留「指派 agent 后自动执行」。
- retry 只调用 `refetch()`，不创建、停止、rerun 或 retry 一个 Run；现有 active polling、Run history、transcript、Sheet/page 路径保持。

## 决策

- 参考 Multica：render `ErrorBoundary` 只能隔离同步渲染错误，不能接住 TanStack Query 的异步拒绝（`references/repos/multica/packages/ui/components/common/error-boundary.tsx:27-34,49-76,80-96`）。
- Multica 的 execution log 也把 query data 默认成 `[]`（`packages/views/issues/components/execution-log-section.tsx:70-75,111`），这是本刀明确不复制的真实性缺口。
- 采用其 skills tab 的显式 `isLoading/isError/refetch` 模式（`packages/views/agents/components/tabs/skills-tab.tsx:237-273`），但 retry 的语义固定为“重试加载”，与失败 Run 的“重新执行”保持分离。

## 证据

- 目标 Web 测试：`IssueDetail.test.tsx`、`IssueDetail.error.test.tsx`、`RunStatusBar.test.tsx`，共 12 passed；覆盖错误摘要、局部错误/无假空态、同 query retry、loading 与成功空态。
- `pnpm check`：通过（shared 6 files / 126 tests；server 120 files / 1035 tests；web 72 files / 504 tests）。
- `node scripts/check-docs.mjs`：通过（7 entries，7 ADRs，CI freeze）。
- 隔离 current-source Server `:3002` + Next `:3003` + 临时 SQLite DB 的 Playwright：`pnpm exec tsx scripts/e2e-issue-runs-truthful-error.mts` 通过。实测拦截 runs 500 后 Issue 内容仍可见、摘要/展开区诚实报错、无空态；恢复后点击 retry 显示真实 run，DB run 数量保持 1。

## 债 / 边界

- 不重写 comments、activities、attachments 的错误策略，也不改变 server 端 run retry/状态机。
- React Query 的自动重试仍存在；本刀保证最终失败不被 UI 改写为空状态。

## 给下一 Owner

- 下一刀候选：Chat 标题编辑 + 归档后安全删除。先确定包含历史 chat run 的 thread 是否允许硬删；推荐拒绝删除并返回可理解的冲突提示，以保存 run 可观测性，而不是静默置空关联。

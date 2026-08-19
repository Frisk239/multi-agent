# Slice：Issue runs 请求真实性

日期：2026-08-19

## 用户路径

用户打开一个 Issue（页或 Sheet）时，本地 `/api/runs?issueId=…` 短暂失败。Issue 的标题、属性、评论仍可用；运行摘要明确说「运行状态暂不可用」。用户展开运行区，看到局部错误和“重试”；服务恢复后点击它，显示真实 run 或真实的「指派 agent 后自动执行」。绝不把失败说成尚未执行。

## 参考与裁决

- 当前根因：`IssueDetail.tsx:261` 和 `RunStatusBar.tsx:28` 分别调用 `useRuns`，且后者将缺失 data 降为 `[]`。
- Multica 外层 ErrorBoundary 只能隔离 render error；fetch rejection 必须显式处理。其 execution log 同样默认 `[]`，此处不照搬；参考同仓 `skills-tab` 的 `isLoading/isError/refetch` 模式（出处见 `app/.progress/issue-runs-truth-discovery-2026-08-19.md`）。
- 选定：IssueDetail 是唯一 query owner，状态数据以 props 下传；局部 ErrorState 的 retry 直接调用同一个 query 的 `refetch`。

## Must

1. IssueDetail 对同一 Issue 只创建一个 `useRuns(id, { refetchActive:true })` 查询，并把 data / isLoading / isError / error / refetch 下传给 RunStatusBar；不得在状态栏再开独立 useRuns。
2. RunStatusBar 只有**成功且空**时显示 `run-status-empty`「指派 agent 后自动执行」；loading 显示加载中；error 显示 `运行状态暂不可用` 的局部 ErrorState + retry。retry 只 refetch，绝不创建、取消或重试 run。
3. 折叠的 Issue 运行摘要也区分 `加载中`、`运行状态暂不可用`、成功空的 `尚未执行`；页面其余 Issue 信息、评论/活动/附件和页面 ErrorBoundary 不被接管。
4. 保留 active polling、停止/再执行、IssueRunHistory、transcript 和 Sheet / page 路径。若 React Query 有旧 data，也不能因最终请求错误而显示“尚未执行”。
5. 新增/更新 Web 组件测试与 Playwright：500 错误 → 局部 error/retry、无假空态；恢复后 retry → 真正 run/空态。验证 Issue 基本内容仍可操作。

## Out

- 全站错误态重构、comments/activities/attachments 错误策略重写
- server retry、离线缓存、run 状态机、错误分类或新的自动执行行为
- 运行历史 UI 重设计

## 验证门槛

- 目标 Web unit/component tests
- `pnpm check`
- `node scripts/check-docs.mjs`
- 隔离 current-source Server + Next 的 Playwright interception 路径

## 后续候选

Chat 标题编辑 + 仅归档后确认删除；先明确含历史 chat run 时拒绝硬删还是保留匿名快照。

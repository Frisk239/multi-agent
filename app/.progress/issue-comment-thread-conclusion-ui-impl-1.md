# Closeout: issue-comment-thread-conclusion-ui

日期：2026-08-19

## 交付

- 实现提交：`74052d0 feat(issue): add comment thread controls`
- Issue 的“评论”Tab 现在把普通 comment 投影为根评论 + 一层 replies；状态变更、孤儿和异常过深历史项仍按原 Timeline 平铺，绝不静默隐藏。`IssueStoryline` 未改。
- 根评论可进入明确标出对象的回复模式，复用既有 Composer 和 `parentCommentId` API；根评论与每个回复对象的本地草稿独立，取消可回到根评论，发送成功会退出回复模式。
- 有回复的根评论可“设最后回复为结论”；已定论可撤销。已定论线程默认仅显示根评论和结论回复，并提供带 `aria-expanded` 的展开/收起；换结论时不会沿用旧结论的展开状态。
- 新增 React Query 定论 mutation（精确替换同一 root cache + success/error toast）、纯 thread 投影测试、组件/hook 测试，以及真实 API + 浏览器验收脚本。

## 决策

- 对齐 Multica：comment card 把回复/定论动作放在根评论上，hook 发送 parent id，thread utility 保持时序与单一结论。证据：`references/repos/multica/packages/views/issues/components/comment-card.tsx:88-126`、`packages/views/issues/hooks/use-issue-timeline.ts:323-345`、`packages/views/issues/components/thread-utils.ts:5-55`。
- 本仓 server/shared 已有一层 `parentCommentId`、`resolve/unresolve` 完整契约（`app/packages/shared/src/schema.ts:1088-1120`、`app/packages/server/src/routes/comments.ts:42-180`），因此本刀只接 Web 闭环，不重复扩展 schema 或改线程状态机。
- 选择“设最后回复为结论”而非 picker：服务端已定义未传 resolution id 时选最后一条 reply，足以覆盖高频协作收束，同时保持小而可逆。

## 证据

- 新增/更新的 thread 组件、Composer、query hook、IssueDetail 和 draft-storage 测试均通过；定向 web 测试为 8 files / 33 tests。
- `pnpm check`：通过（shared 6 files / 128 tests；server 120 files / 1046 tests；web 77 files / 517 tests）。
- Owner 独立隔离 current-source Server `:3002` + Next `:3003` + 临时 SQLite 的 Playwright：`pnpm exec tsx scripts/e2e-issue-comment-thread-conclusion.mts` 全绿：root → two replies（真实 `parentCommentId`）→ refresh nested → resolve collapse → accessible expand/collapse → unresolve restore。E2E 结束会删除自己创建的临时 Issue，服务已停止。
- 脚本默认 Web origin 统一为 `localhost`，与本地 server 默认 CORS 保持一致，避免 `127.0.0.1` 带来的浏览器 `Failed to fetch` 假失败。

## 债 / 边界

- 不做多层评论、编辑/删除/表情、结论 picker，也不改 Storyline 的全局时序。
- 若旧数据的 `resolutionCommentId` 已不在回复列表内，UI 宁可展示全部回复而不隐藏讨论；后端数据修复另立刀。
- 一条已定论线程出现新回复后仍保留已有结论，符合当前 server 语义；不会自动改写或撤销结论。

## 给下一 Owner

- 下一候选：Agents roster 的“正在做什么”可行动化。当前只有 `working (n)`，应批量投影最新 active issue run 的 identifier/title，单 run 直达详情、多 run 进入筛选的 Runs；避免 N+1。调研见 `app/.progress/next-frontend-ux-discovery-2026-08-19.md`。
- 不重开 Runs、Chat、评论线程或 G8-4b。

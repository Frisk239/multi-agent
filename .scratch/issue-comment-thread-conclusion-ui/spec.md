# Spec: Issue 评论线程与结论 UI

日期：2026-08-19
主 Goal：G3 前端体验 / Issue 协作闭环

## 用户路径

在 Issue 的“评论”页签，成员读到一条根评论后点击“回复”，底部复用评论编辑器发送一条一层回复；刷新后仍嵌套在根评论下。根评论有回复时，成员可将最后一条回复设为结论；线程随即只显示根评论和结论，仍可展开查看其余回复或撤销定论。

## Must

- `Timeline` 将普通 comment 投影为根评论 + 一层 replies；status change / 其他非线程项维持既有可见性，不改 Storyline。
- 根评论提供“回复”；复用 `CommentComposer`，请求带已有的 `parentCommentId`，回复目标可见、可取消，成功后退出回复模式。回复草稿不得与根评论草稿串写。
- 有 reply 的根评论提供“设最后回复为结论”；已定论根评论提供“撤销定论”。复用既有 `POST /api/comments/:id/resolve` / `unresolve`，React Query cache 与 toast 同步。
- 已定论线程默认折叠：显示根评论和 resolution reply，并有可访问的展开/收起控件；未定论显示所有一层 reply。
- 视觉沿用现有 Timeline / Composer token；明确回复缩进、结论标记和危险性为零的可逆操作。
- 单元/组件测试覆盖分组、reply payload、resolve/unresolve/recovery UI；隔离 current-source Playwright 覆盖 root → reply → reload nesting → resolve/collapse/expand → unresolve。

## Out

- 多层嵌套、评论编辑/删除/表情、resolution picker、改 Storyline 的全局时序或任何后端线程状态机重写。
- 不触碰 Runs、Chat、Agents roster 或 G8-4b。

## 参考与裁决

- Multica comment card 持有 reply / resolve actions：`references/repos/multica/packages/views/issues/components/comment-card.tsx:88-126`；其 hook 发送 `parentId`：`packages/views/issues/hooks/use-issue-timeline.ts:323-345`；thread utility 保持时间顺序与唯一结论：`packages/views/issues/components/thread-utils.ts:5-55`。
- 本仓已有完整一层回复与定论 API：`app/packages/shared/src/schema.ts:1088-1120`、`app/packages/server/src/routes/comments.ts:42-180`；仅 Web 的 `Timeline.tsx`、`TimelineItem.tsx`、`CommentComposer.tsx` 未接入。
- 选定“根评论快捷设最后回复为结论”，不引入选择器：服务端已定义缺省 resolution 为最后一条回复，覆盖当前高频闭环且范围可控。

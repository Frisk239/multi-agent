# 下一轮前端 UX 调研（2026-08-19）

## 排序

1. **Issue 评论线程与结论 UI（下一候选）**：shared/server 已有一层 reply、resolve/unresolve，但 Web Timeline 扁平且 composer 不能带 parent。Multica `comment-card.tsx:88-126` / `use-issue-timeline.ts:323-345` 有对应交互；本仓证据 `app/packages/shared/src/schema.ts:1088-1120`、`server/src/routes/comments.ts:42-75,116-180`、`web/components/Timeline.tsx:6-24`、`TimelineItem.tsx:25-83`、`CommentComposer.tsx:32,281-299`。
2. **Agents 当前任务可行动化**：本仓只显示 working(n)，没有任务语义/直达 Run；Multica `agents/components/agent-live-peek-card.tsx:25-38,124-205` 可点当前 Issue。需要 bulk latest-active projection，避免 N+1。

## 裁决

先不取这两条：worker health false-positive 会造成任务排队却健康绿灯，是更高风险的运营真实性问题。完成后优先取第 1 条评论 UI。

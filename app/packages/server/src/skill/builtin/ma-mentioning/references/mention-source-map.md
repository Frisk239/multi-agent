# Mention source map（ma-mentioning）

## 解析

- `mention://(agent|squad)/<id>` 正则 + 去重：`orchestration/comment-trigger.ts:24-40`
- 前端 @ 输入 → 链接转换（chips）：`web/components/CommentComposer.tsx`（S6 mention chips 薄版）

## 触发路由（multica computeCommentAgentTriggers 移植）

- 主入口：`orchestration/comment-trigger.ts:249`（`triggerFromComment` fallback 链）
- 有 mention → 只按 mention（不叠加 assignee）：`comment-trigger.ts:256`（`mentions.length > 0` 分支）
- B1 无 mention → 指派人：`comment-trigger.ts:126`（`routeToAssignee`）
- B2 回复 agent 评论 → 父作者：`comment-trigger.ts:211`（`routeThreadParent`）
- agent 作者窄路径：`comment-trigger.ts:182`（`routeSquadAssignedLeaderWake`）
- 参照上游：`references/repos/multica/server/internal/handler/comment.go:1897`（`computeCommentAgentTriggers`，五源：issue_assignee / mention_agent / mention_squad_leader / thread_parent / conversation_continuation）

## 派发可见性

- 系统总结评论（按 source 区分标题）：`comment-trigger.ts:75`（`publishDispatchSummary`：@提及派发 / 将任务派给指派人 / 回复将唤醒）
- activity `mention_delegated` payload 带 source：`comment-trigger.ts:83-93`

## 防重复

- per-(issue,agent) 去重 + 熔断：`orchestration/run-service.ts:218-354`

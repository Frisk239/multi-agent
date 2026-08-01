# Squad source map（ma-squads）

## 数据模型

- `squad.leader_id`（leader 单独存，不在成员表）：`db/schema.ts:81`
- `squad_member`（roster = 可被 @ 的成员，恒 agent）：`db/schema.ts:350-365`
- leader 查询：`db/squad-loader.ts:28`（`getSquadLeaderId`）

## 派发路径

- squad mention → leader run：`orchestration/comment-trigger.ts:119-152`（`enqueueLeaderRun(issueId, leaderId, squadId)`；无 leader 出 note；leader 自指跳过）
- B1 assignee=squad → leader fallback：`comment-trigger.ts:126`（`routeToAssignee`）
- agent 作者窄路径（worker 完成评论唤醒 leader）：`comment-trigger.ts:182`（`routeSquadAssignedLeaderWake`，self-trigger guard）

## Prompt 注入

- briefing 注入（协议 + roster）：`runtime/prompt.ts:222-231`（静态前缀 blocks：skills → about → instructions → boundary → **protocol/roster**）
- roster 查询：`runtime/prompt.ts`（squad protocol 段）

## 委派链

- 子代理解析与委派：`orchestration/subagent-dispatch.ts:13`（深度上限 K=2）
- 子任务完成传播：`orchestration/child-done-propagation.ts`（全子终态 → 父通知）

# Issue 工作流 source map（ma-working-on-issues）

> 带本仓 `file:line` 的关键出处；行号随 main 滚动，漂移时以 git 为准。

## 评论触发路由（你怎么被派活）

- mention 解析与派发：`app/packages/server/src/orchestration/comment-trigger.ts:24-40`（`parseMentions`，只认 `mention://(agent|squad)/<id>`）
- B1/B2 评论路由 fallback 链（无 mention → 指派人；回复 agent 评论 → 父作者）：`comment-trigger.ts:249`（`triggerFromComment`）
- 挂接点：人工评论 `routes/comments.ts:89`（POST，announce）；agent 终态评论 `run-worker.ts:713` 附近
- 防乒乓：`orchestration/run-service.ts:218-354`（`checkAndEnqueue`：per-(issue,agent) 去重 + 15 次熔断）

## 完成与失败语义

- run 完成写评论 + activity：`orchestration/run-worker.ts:660-700`（`run_completed` + 完成评论；**不改 issue 状态**）
- run 失败：`run-worker.ts:790`（`failRun`：终态 + 失败评论 + inbox）
- 失败分类：`shared/src/failure-classify.ts:70`（`classifyFailure` 规则表；`runtime_offline` / `exec_error` / `timeout` 等）
- 自动重试：`shared/src/failure-classify.ts:12`（`AUTO_RETRY_FAILURE_REASONS`）+ `orchestration/auto-retry.ts`（`insertRetryChild`，`auto_retry_of_run_id` 子 run）
- 自动改派（连接不上 → 后备 agent）：`orchestration/auto-retry.ts` `insertEscalatedChild`（`isConnectionFailure` 触发面；`escalated_from_run_id` 追溯；深度 1）
- stale 收尸（慢/卡）：`orchestration/stale-runs.ts`（`failStaleRunningRuns` / `failStalePrepareLeaseRuns`）

## CLI 回写

- `ma issue create`：`cli/ma.ts:191`（`pos[1] === 'create'`；要求 `--origin-run` 溯源，`cli/ma.ts:125`）
- `ma wiki` 子命令：`cli/ma.ts:200-240`（health / lint / query / pages / jobs / ingest）

## 状态语义

- issue 状态机：`shared/src/schema.ts` `IssueStatus`（todo/in_progress/done 等）
- done 的 ambient 记忆与 wiki 联动：`routes/issues.ts:432`、`:827`（`sc.to === 'done'` 路径）

# Closeout: Comment follow-up 排队

日期：2026-08-19  
Slug：`comment-followup-queue`

## 用户路径

running 的 Issue 再评一句 → 插入最多 1 条 queued follow-up；当前 run 结束后自动接上。再评合并进已有 pending，时间线「已并入排队中的跟进」。

## 交付

- `already_active` 只挡同 `(issue,agent)` 的 `queued` / `waiting_local_directory`
- `running` 时允许 1 条 follow-up；再评不插第二行 + merge note
- comment-trigger 不再把 `enq.run` 当「未新建」吞掉
- 学 Multica HasPendingTask，不做 mid-run stdin

## 证据

Owner 复跑：`run-service.enqueue.test.ts` + `comment-trigger.test.ts` → **33 passed**

## 债

- merge note 不走 POST /comments，故不会再触发 trigger（无环）；若以后把 `comment:created` 接到 trigger，须跳过 system note
- 无 path-lock 且 concurrency>1 时 follow-up 可能与当前 run 并行
- 未 commit

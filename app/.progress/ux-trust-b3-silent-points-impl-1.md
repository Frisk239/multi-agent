# UX Trust B3 — 静默点收口

Date: 2026-07-21  
Branch: main

## 本刀范围

| 静默点 | 修复 |
|---|---|
| Squad 无 leader 指派 | enqueue `reason=no_leader` + 中文 detail；不再 `not_applicable` |
| @mention 全 skip | toast 按 runId 成败：全成 / 部分 / 全失败 |
| 自动化建卡成功但未开工 | `status=success` 且 `error` 写明 enqueue 跳过；toastError |

## 改动

- shared：`EnqueueSkipReason.no_leader`；`SquadDetail.leaderId` 可 null
- `squad-loader`：无 leader 仍返回详情
- `issue-create` / `run-service` / `comment-trigger` / `automation-dispatch`
- web `api.ts`：toastEnqueueMeta / useCreateComment / useRunAutomationNow
- `SquadDetailPage` 适配 nullable leader

## 验收

| 项 | 结果 |
|---|---|
| typecheck | PASS |
| 指派无 leader 小队 | `enqueue: { status:skipped, reason:no_leader, detail:含小队名 }` |
| mention 无 leader | `dispatches[0].runId=null` · note 含「无 leader」 |
| 自动化 toast | success+error → toastError（代码路径） |

## 下一刀

Wave B 出口已到 · 默认 **C1 同 localPath 简易串行** 或人改向。

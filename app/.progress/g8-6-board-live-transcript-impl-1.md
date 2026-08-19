# Closeout: G8-6 加厚 · 看板内看最新产出

日期：2026-08-19  
Slug：`g8-6-board-live-transcript`  
Spec：`.scratch/g8-trust-execution/spec.md` §G8-6 + 08-19 差距分析加厚

## 用户路径

看板打开 Issue Sheet → 见当前 run **最新**事件尾窗 → 失败点「再执行」不离开 `/?issue=`。

## 交付

- `GET /api/runs/:id/messages`：无 query=全量；`limit` only=尾窗；`afterSeq`=更新；`beforeSeq`=更早；双 cursor 400。
- `useRunMessages` 双向窗（next=更新，previous=更早）。
- Sheet 预览 `slice(-n)`；`pickDefaultRunId` 含 `waiting_local_directory`；失败 CTA 就地 `useRetryRun`。
- RunDetail 锚定最新 +「加载更早的事件」。
- Subagent 树 `isError` → ErrorState；Sheet「Markdown · 附件」。

## 证据

- server 契约 + window 纯函数：10 passed
- web sheet/preview/RunDetail/SubagentTree/sheet-work-surface：14 passed（定向）
- shared/server/web typecheck：实现子代理报过；Owner 复跑 shared typecheck + 上述测绿
- 未跑全量 `pnpm check` / Playwright（工作区混有 G8-2…5a WIP）

## 债

- 恰好 500 条时可能多打一次空 beforeSeq
- 未 commit（与 G8-2…5a 混在同一 worktree，禁止一锅端）
- **下一刀：** running 时评论 follow-up 排队（`already_active` 丢掉追问）

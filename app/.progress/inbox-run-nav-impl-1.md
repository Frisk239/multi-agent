# Handoff: inbox-run-nav-impl-1

> 自动迭代 · main · 2026-07-17  
> 选型：Inbox **runId** 列 + 打开 → `/runs?run=&status=`（复用 URL mirror）

## 交付

- drizzle `0014_inbox_run_id`：`inbox_item.run_id`  
- `notifyRunTerminal` 写入 `runId`  
- API `InboxItem.runId`  
- Inbox UI：优先跳 runs 高亮；按钮「运行」  

## 证据

- typecheck 绿  
- API：rerun → failed inbox 项带 runId  
- Playwright：Inbox「运行」→ `/runs?run=…&status=failed` 且行高亮  

## Multica

从收件箱进失败任务/执行面；本仓补 run 级深链。

## 下一刀建议

Wiki/Memory 日常路径；或 comment 类 inbox 保持 issue 深链不变（已有）。

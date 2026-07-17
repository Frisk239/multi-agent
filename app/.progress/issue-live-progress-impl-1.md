# Handoff: issue-live-progress-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

1. RunStatusBar live：脉冲点 + 不确定进度条 + waiting/progress 文案
2. 入口：看轨迹（#run-trace scroll）· 运行列表 `?run=&status=`
3. RunTrace：优先活跃 run；`id=run-trace`；live badge；进度回显

## 证据

- typecheck 绿
- Playwright FRI-07：status=running，live panel/entry/trace badge；看轨迹 inView；运行列表高亮

## Multica

执行中任务在详情页可一眼跟进度并跳转轨迹/列表。

## 再下一刀建议

- Settings 一键复制 MA_WORKSPACE_CWD 片段
- 看板 live 卡片点进详情后自动锚到 #run-trace

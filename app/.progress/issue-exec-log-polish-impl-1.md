# Closeout: issue-exec-log-polish

日期：2026-07-21

## Multica 对照

源码：`packages/views/issues/components/execution-log-section.tsx`  
- 区块「执行日志」可折叠  
- 活动 task 行 + **显示历史运行（N）** 二级折叠  
- 行级主操作：transcript / cancel / retry（hover 显），**无**一排本地运维深链  

本仓本地超车（保留但收束）：失败分类、环境/看板/收件箱/复制错误 → 放进 **「更多运维」**。

## 交付

| 组件 | 改动 |
|---|---|
| `RunStatusBar` | 紧凑条：状态 pill + 再执行 / 时间线 / 更多运维；失败说明卡不再铺 8 个按钮 |
| `IssueRunHistory` | 行列表替代大表；用量一行摘要；行操作仅时间线+列表 |
| `RunEventTimeline` | 头链收束为 展开 / 列表 / 诊断 |
| CSS | `run-status-bar--compact` / `issue-run-row` 等 |

## 证据

Playwright `FRI-67` 执行日志展开：  
`actions = "再执行 时间线 更多运维"` · failBox · historyRows=1 · 点更多出现 ops drawer  

typecheck web 绿。

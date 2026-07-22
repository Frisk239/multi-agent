# UX Trust D3 — Run tool 叙事加厚

Date: 2026-07-22  
Branch: main

## 本刀范围

| 项 | 内容 |
|---|---|
| Must | tool_start/end 折叠预览：工具名 + args/result 摘要；opencode 空态诚实文案保留 |
| Out | opencode 流解析大改、新协议 |

## 改动

- `RunEventTimeline.tsx` parseToolPayload + preview
- `RunDetailPage.tsx` toolSummaryLine 折叠预览
- `web/scripts/test-tool-narrative-d3.mts`

## 验收

| 项 | 结果 |
|---|---|
| typecheck | **PASS** |
| test-tool-narrative-d3 | **ALL PASS** |

## Wave D / UX Trust

D1–D3 ✅ → Wave D 出口；阶段 plan 收官（P0/P1 队列做完）。

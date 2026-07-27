# Slice 73 · 流式 partial / tool 折叠 · closeout

> 2026-07-27 · Phase F · main 直推

## 交付

- Run inline/drawer 消费 `partialByRunId`（`run-partial` + Markdown）
- pair 折叠更密：一行 args + kind 色条；`pairArgsLinePreview` / denser `pairCollapsedPreview`
- drawer stick-bottom（80ms throttle + sentinel；jsdom 安全）
- unit 17 + e2e 8 PASS

## 证据

- `app/.progress/slice73-stream-partial-impl-1.md`
- `app/packages/server/scripts/e2e-slice73-stream-partial.mts`
- Owner 复验：vitest 17 PASS · e2e PASS=8

## 下一刀

Slice 74 · Tool 事件只读面板（**可选**）· 或新阶段选题

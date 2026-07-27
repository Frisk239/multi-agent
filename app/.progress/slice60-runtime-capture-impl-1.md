# Slice 60 · Runtime 捕获均衡（opencode/cursor 优先）impl-1

Date: 2026-07-27  
Slug: `slice60-runtime-capture`  
Branch: local（**不 commit / 不 push**）

## 目标

统一加深 **usage / tool 事件 / providerSessionId** 尽力捕获（opencode + cursor 优先）；**不**把 `supportsSessionResume` 对 opencode/cursor 翻 true。

## 交付

| 层 | 内容 |
|---|---|
| usage-parse | `extractOpencodeStepTokens`（nested `cache.read/write`）；`mergeUsage` export；result 顶层 camelCase；`hasTokenSignal` |
| opencode | Multica `--format json`：`sessionID` / `text` / `tool_use`（state completed→tool_end）/ `step_finish.tokens` 累加；execute 加 `--format json` |
| cursor | `tool_call` 信封 `*ToolCall`（started/completed）；result usage camelCase；call_id 双行规范化 |
| grok | 顺手：ctx 传 usage + session；spawn 回调带 ctx |
| 契约表 | `runtime-capture.ts` 捕获矩阵 + gapNote（uncosted/no_tokens 诚实说明） |
| 单测 | `runtime-capture.test.ts`；usage-parse / cliequalization 增补；resume 矩阵不回归 |
| e2e | `scripts/e2e-slice60-runtime-capture.mts` → `.progress/logs/` |

## 拍板

- **捕获 ≠ resume**：session id 可写库，但策略层 resume 仍仅 claude-code
- Multica 真 fixture 形状优先（opencode `sessionID`/`part.tokens`；cursor `tool_call`/`usage.inputTokens`）
- analytics：已有 `uncostedRuns` + gapNote 文档；无 token → `no_tokens`，禁止假 $0

## Out

- 假 resume / 翻 supportsSessionResume
- Pi 真执行
- 前端大改

## 验收命令

```bash
cd D:/code/multi-agent/app/packages/server
pnpm exec tsc --noEmit
pnpm exec vitest run src/runtime/usage-parse.test.ts src/runtime/runtime-capture.test.ts src/runtime/cliequalization.test.ts src/runtime/session-resume.test.ts --reporter=dot
pnpm exec tsx scripts/e2e-slice60-runtime-capture.mts
```

## 自测证据

```
$ cd app/packages/server && pnpm exec tsc --noEmit
（无输出，exit 0）

$ pnpm exec vitest run src/runtime/usage-parse.test.ts src/runtime/runtime-capture.test.ts \
    src/runtime/cliequalization.test.ts src/runtime/session-resume.test.ts --reporter=dot
Test Files  4 passed
Tests       35 passed

$ pnpm exec tsx scripts/e2e-slice60-runtime-capture.mts
summary pass=8 fail=0 skip=0 warn=0
  matrix.resume.honest / no-flip
  fixture.opencode.multica + fixture.cursor.multica
  service.diag.others-no-resume
log → app/.progress/logs/e2e-slice60-runtime-capture-*.log
```

## Residual

- 真 CLI 冒烟未跑（e2e 纯 fixture）
- grok ACP 仍非完整客户端
- analytics API 未新增 capture-gap 字段（gap 在契约表 + 既有 uncosted 计数）
- 未 commit / 未 push

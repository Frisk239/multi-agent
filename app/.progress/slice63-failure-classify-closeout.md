# Slice 63 · failureReason 扩档 + Classify · closeout

> 2026-07-27 · Phase E · main 直推

## 交付
- `AgentRunFailureReason` 扩至 13 档（+auth/quota/session_poisoned/cancelled/user_aborted）
- shared `classifyFailure` 规则表真源；`run-worker.inferFailureReason` 接线
- unit：shared 65 + stale-runs 15；shared/server tsc 绿

## 证据
- `app/.progress/slice63-failure-classify-impl-1.md`
- Owner 复验：shared vitest 65 PASS

## 决策
- 档位略超 12（历史 8 + 新 5 = 13）；不再加档
- stale-runs 已知原因继续 explicit，不强制走字符串表
- UI chip 留给 64；`classifyRunFailure` 保留

## 下一刀
Slice 64 · 失败 chip + 中文动作映射（挂 `run.failureReason`）

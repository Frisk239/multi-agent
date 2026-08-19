# TRACEABILITY — Goal → 刀 → 测试去向

> Roadmap 不是工单。本表只回答「这条目标的回归在哪」，不代替 §4 队列。

| Goal | 代表刀 | 主要回归 |
|---|---|---|
| G1 执行诚实 | Pi / Grok ACP / 失败分类 / preflight | `app/packages/server/src/runtime/*.test.ts` · `readiness*.test.ts` |
| G2 编排闭环 | deferred / follow-up / 并发配额 | `run-service.enqueue.test.ts` · `stale-*.test.ts` · `comment-trigger.test.ts` |
| G3 / G7 前端 | 错误态 / Sheet / 键盘 | `app/packages/web/components/*.test.tsx` · `e2e-g7-frontend-wave.mts` |
| G4 知识记忆 | FTS / scope / projectId | `memory/*.test.ts` · `lib/api/memory.ts` 测 |
| G5 可靠运营 | backup / notify / import | `ops-*.test.ts` · `routes/ops.test.ts` |
| G6 精细度 | 优先级 / 占位 / 慢日志 | 各 `g6-*-closeout` 所列测 |
| G8 可信执行 | ownership / secret / scrub / 尾窗 | `execution-ownership.test.ts` · `secret-*.test.ts` · `run-messages-window.test.ts` |

关刀时若新增 Goal 级能力，在本表加一行（能力 → 测），不要把本表写成流水账。

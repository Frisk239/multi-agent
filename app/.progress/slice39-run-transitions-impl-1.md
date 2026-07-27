# Slice 39 · Run 状态转移统一 + Wiki 退避 · closeout

> 2026-07-27 · Phase B R6

## 交付

| 路径 | 内容 |
|---|---|
| `run-transitions.ts` + test | `transitionRun`，changes=0 no-op |
| run-service / run-worker / stale-runs | cancel/claim/fail/complete/orphan 等接线 |
| `ingest-queue` + test | `nextAttemptAt` 指数退避 + claim 过滤 |
| drizzle `0035_wiki_ingest_next_attempt_at.sql` | 列迁移 |
| shared `WikiIngestJob.nextAttemptAt` | 可选字段 |

## Must

1. ✅ 0-change 不伪成功事件  
2. ✅ cancel/fail/timed_out/orphan 等接 helper  
3. ✅ Wiki fail 退避；dead/人工 retry 保留  
4. ✅ 单测 6/6 + orchestration/wiki 回归  

## 证据

```text
vitest run-transitions + ingest-queue → 6 passed
typecheck shared/server Done
```

## 债

- client/test-db 仍有部分兼容 ALTER（交 Slice 41 单轨拆除）

## 下一刀

Slice 40（并行已实现）→ 41 迁移单轨

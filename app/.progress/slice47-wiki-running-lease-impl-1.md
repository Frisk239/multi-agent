# Handoff / Closeout: slice47-wiki-running-lease-impl-1

> 切片：`wiki-running-lease` · 角色：`owner` · 日期：2026-07-27  
> Slice 47 · Wiki running lease（H2）

## 上下文

Wiki ingest 卡在 `running`（worker 崩溃/挂死）时，超过可配墙钟后自动回 `pending`（fail+backoff）或 `dead`，同 issue 可再被 claim；与 nextAttemptAt / dead / bulk retry 兼容。

## 本会话完成了什么

- `ingest-queue.ts`：`requeueStaleRunningJobs(now)` + `getWikiRunningLeaseMs()` / `MA_WIKI_RUNNING_LEASE_MS`（默认 **20min**）
- 策略：运行中 lease → **fail 路径**（failCount++；&lt;max → pending+nextAttemptAt；满 → dead）
- 启动 `recoverStuckRunningJobs`：**不计 failCount**、立即 pending（孤儿锁）；与运行中 lease 语义分离
- `complete`/`fail` 加 `status=running` 闸，防 lease 后迟到 complete/fail 双杀
- worker tick 每轮扫 lease（busy 时也扫）
- 单测：时钟推进、dead、recover 不计次、no-op 双杀、lease=0
- e2e：`scripts/e2e-slice47-wiki-lease.mts`（无服 SKIP）
- `.env.example` 注释钉死 env

## 策略钉死

| 路径 | 行为 |
|---|---|
| **启动 recover** | 全部 `running` → `pending`；failCount 不变；nextAttemptAt=null |
| **运行中 lease** | `startedAt ?? updatedAt` &lt; now−lease → fail 路径；默认 lease=20min |
| **env** | `MA_WIKI_RUNNING_LEASE_MS`；`0`/`false` 关闭运行中 lease |
| **与 backoff** | requeue 后 nextAttemptAt 与 fail 一致；claim 仍尊重 |
| **与 dead/retry** | 多次 lease 可 dead；`retry` / `retry-dead` 不变 |
| **不双杀** | lease 后 complete/fail no-op（仅 running 可终态） |

## 自测结果（必须有证据）

```text
$ pnpm exec vitest run packages/server/src/wiki --reporter=dot
Test Files  5 passed (5)
     Tests  23 passed (23)

$ pnpm --filter @ma/server typecheck
Done

$ pnpm exec tsx scripts/e2e-slice47-wiki-lease.mts
PASS healthz / jobs list / retry-dead / filter.pending
WARN no live running jobs (unit covers lease)
```

## 偏离

无

## 未做 / 债 / 合并注意

- 无 heartbeat 续租：长 LLM 若超过 20min 会被当 stale（可调大 env）
- 未暴露 lease 阈值到 health/settings API（可选后续）
- 不 commit/push（按 owner 指示）

## 分支

- 本地实现 · 未 commit

## 给下一 Owner

- 验收：vitest wiki + typecheck + e2e script
- 建议下一主题：Slice 48 ConfirmDialog

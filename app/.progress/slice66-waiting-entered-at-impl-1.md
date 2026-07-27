# Slice 66 · waiting_local 进入时刻 · impl-1

## 改动

### 列 / 契约
- DB：`agent_run.waiting_local_entered_at` integer nullable（epoch ms）
- drizzle：`0037_waiting_local_entered_at.sql` + journal idx 37
- schema：`packages/server/src/db/schema.ts` → `waitingLocalEnteredAt`
- shared：`AgentRun.waitingLocalEnteredAt: z.number().nullable().optional()`
- reshape：`toAgentRun` 映射 epoch ms（旧行 null）

### 写 / 清
| 时机 | 行为 |
|---|---|
| `queued` → `waiting_local_directory`（run-worker path gate） | **set** `waitingLocalEnteredAt = now` |
| claim → `running` | **clear** null |
| cancel / fail / complete / waiting wall timeout / missing-agent fail | **clear** null |
| 仍处 waiting 的 lease touch | **不改** enteredAt（只 touch lastHeartbeatAt） |

### 消费
- `failStaleWaitingLocalDirectoryRuns`：优先 `waitingLocalEnteredAt`，旧行回退 `createdAt`
- Ops `buildOpsRunsSnapshot`：waiting 龄用 enteredAt（null → createdAt）
- UI：`waiting-elapsed.ts` → RunDetail / RunStatusBar / RunsPage 展示「已等待 Xs」

### Out
- 未改 path-lock 语义 / 新等待状态机

## 自测证据

```text
cd app/packages/shared && pnpm exec tsc --noEmit   # clean
cd app/packages/server && pnpm exec tsc --noEmit   # clean
cd app/packages/web && pnpm exec tsc --noEmit      # clean

cd app/packages/server && pnpm exec vitest run \
  src/orchestration/waiting-local-entered-at.test.ts \
  src/db/reshape.test.ts \
  src/orchestration/stale-runs.test.ts
# 3 files / 25 tests PASS

cd app/packages/web && pnpm exec vitest run lib/waiting-elapsed.test.ts
# 1 file / 3 tests PASS

cd app/packages/server && pnpm exec tsx scripts/e2e-slice66-waiting-entered-at.mts
# unit PASS×2；live SKIP（无服）

cd app/packages/server && pnpm exec tsx scripts/test-path-lock-waiting.mts
# ALL PASS（含 enteredAt 写/清）
```

## 偏离
无

## 未做 / 债
- 生产库需 `pnpm --filter @ma/server db:migrate`（0037）后 API 才有列
- live e2e 需本地 server 已 migrate；本次 SKIP
- Settings Ops 仅用 queueAge 间接反映 waiting 龄，未单独加「最长已等待」文案（queueAge 已切 enteredAt）

## 分支
- 未 commit / 未 push（按任务禁区）

## 给下一 Owner
- 验收：造 path-lock waiting → GET run 有 `waitingLocalEnteredAt`；UI 见「已等待 Xs」；claim 后字段 null
- 下一刀：Slice 67 force_fresh_session

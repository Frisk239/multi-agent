# Slice 67 · force_fresh_session 显式控制 · impl-1

## 改动

### 契约
- `RerunIssueInput`：`forceFresh?: boolean`（默认缺省 = false）
- 新增 `RetryRunInput`：`forceFresh?: boolean`
- `AgentRun.sessionResumeStatus` 增枚举 **`force_fresh`**

### 后端
| 路径 | 行为 |
|---|---|
| `resolvePriorSession` | `forceFresh` 或 `sessionResumeStatus=force_fresh` → `resumeSessionId=null` / status=`force_fresh`；**不**改能力矩阵 |
| `finalizeSessionFields` | planned=`force_fresh` 时终态保留 |
| `checkAndEnqueue` | `forceFresh` → 落库 `sessionResumeStatus=force_fresh` + system note `[session] force_fresh…` |
| `rerunIssue` / `retryRun` | 透传 `forceFresh` |
| `POST /api/runs/:id/retry` | 解析 `RetryRunInput` |
| `POST /api/issues/:id/rerun` | 解析 body.`forceFresh` |
| `run-worker` | 读 row.`sessionResumeStatus` 传入 resolve |

### UI
- RunDetail 失败可再执行旁 checkbox `data-testid="force-fresh-checkbox"`
- `failureReason=session_poisoned` 或 `sessionPoisoned` 默认勾选
- `useRetryRun` 支持 `string | { runId, forceFresh }`
- 会话 chip 文案「强制新会话」

### Out
- 未改非 claude resume 矩阵
- 无跨 runtime session 迁移 / 假 resume
- 无新 DB 列（复用 sessionResumeStatus + system note）

## 自测证据

```text
cd app/packages/shared && pnpm exec tsc --noEmit   # clean
cd app/packages/server && pnpm exec tsc --noEmit   # clean
cd app/packages/web && pnpm exec tsc --noEmit      # clean

cd app/packages/shared && pnpm exec vitest run src/schema.test.ts
# 35 PASS

cd app/packages/server && pnpm exec vitest run \
  src/runtime/session-resume.test.ts \
  src/orchestration/force-fresh.test.ts \
  src/orchestration/run-control.test.ts
# 3 files / 21 tests PASS

cd app/packages/server && pnpm exec tsx scripts/e2e-slice67-force-fresh.mts
# unit PASS×7；live SKIP（无服）
```

## 偏离
无

## 未做 / 债
- live e2e 需本地 server；本次 SKIP
- Inbox / Runs 列表行未挂 force-fresh checkbox（仅 RunDetail 主路径）
- 未 commit / 未 push

## 给下一 Owner
- 验收：失败 run 勾「强制新会话」→ 新 run `sessionResumeStatus=force_fresh`，无 resume id；session_poisoned 默认勾
- 下一刀：Slice 68 prepare_lease

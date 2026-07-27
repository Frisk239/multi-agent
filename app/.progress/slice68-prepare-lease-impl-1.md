# Slice 68 · prepare_lease 轻量 · impl-1

## 钉死决策

| 项 | 值 |
|---|---|
| 列 | `prepareLeaseExpiresAt` / DB `prepare_lease_expires_at` integer nullable epoch ms |
| claim | 写 `now + MA_PREPARE_LEASE_MS`（默认 **120000**；`0`=关闭不写） |
| 稳定 running | `registerRunAbort` 后 **清 null** |
| **半 claim 判定** | `status === 'running'` **且** `prepareLeaseExpiresAt != null` **且** `prepareLeaseExpiresAt < now` |
| **过期行为** | **fail**（**不** requeue）：`status=failed`，`failureReason=exec_error`，error 含 `prepare_lease` |
| 状态机 | 本仓无 `dispatched`；claim 仍是 `queued\|waiting_local_directory → running`，用 lease 列标 prepare 窗（Multica FailStale 精神、单进程） |

## 半 claim 时间线

```text
queued/waiting ──claim──► running + prepareLeaseExpiresAt=now+lease
                              │
                              ├─ prepare (cwd / session / prompt) 仍有 lease
                              │
                              ├─ registerRunAbort ──► prepareLeaseExpiresAt=null  （稳定 running）
                              │
                              └─ 崩溃/卡死且 lease 过期 ──sweeper──► failed (exec_error)
```

## 改动文件

| 路径 | 作用 |
|---|---|
| `packages/server/drizzle/0038_prepare_lease_expires_at.sql` | 迁移 |
| `packages/server/drizzle/meta/_journal.json` | idx 38 |
| `packages/server/src/db/schema.ts` | 列 |
| `packages/shared/src/schema.ts` | API AgentRun 字段 |
| `packages/server/src/db/reshape.ts` | toAgentRun 映射 |
| `packages/server/src/orchestration/run-worker.ts` | claim 写 lease；register 后清；终态清 |
| `packages/server/src/orchestration/run-service.ts` | cancel 清 lease |
| `packages/server/src/orchestration/stale-runs.ts` | `getPrepareLeaseMs` / `failStalePrepareLeaseRuns` / recover + sweeper |
| `packages/web/lib/api.ts` | recover-stuck toast 可选 `stalePrepareLease` |
| tests | `prepare-lease.test.ts` + stale-runs / reshape / migrator |

## Out

- 多 host / Redis / SKIP LOCKED / 新 status 枚举

## 自测

```text
cd app/packages/shared && pnpm exec tsc --noEmit   # clean
cd app/packages/server && pnpm exec tsc --noEmit   # clean
cd app/packages/web && pnpm exec tsc --noEmit      # clean

cd app/packages/shared && pnpm exec vitest run src/schema.test.ts
# 35 tests PASS

cd app/packages/server && pnpm exec vitest run \
  src/orchestration/prepare-lease.test.ts \
  src/orchestration/stale-runs.test.ts \
  src/db/reshape.test.ts \
  src/db/schema-migrator.test.ts
# 4 files / 32 tests PASS
```

## 偏离

无

## 未做 / 债

- 生产库需 `pnpm --filter @ma/server db:migrate`（0038）
- 未写 live e2e（unit 已覆盖 claim 写 / 稳定清 / 过期 fail / 正常 running 不受损）
- recover-stuck UI 文案仅 optional 显示 `stalePrepareLease`，未做独立 Ops 卡

## 分支

- 未 commit / 未 push（按任务禁区）

# Slice 57 · SQLite 硬化 · impl-1

## 改动摘要

打开主库后统一设置 `journal_mode=WAL`、`foreign_keys=ON`、`busy_timeout`（默认 5000ms，`MA_SQLITE_BUSY_TIMEOUT_MS` 可覆盖）。Ops snapshot 暴露 `sqlite: { path, busyTimeoutMs, journalMode, foreignKeys }`。优雅关停末尾 `wal_checkpoint(PASSIVE)`（可关、失败只 warn）。

## 文件列表

| 文件 | 变更 |
|------|------|
| `packages/server/src/db/sqlite-pragmas.ts` | **新建** resolve/apply/read/walCheckpoint/getHardeningInfo |
| `packages/server/src/db/client.ts` | 用 applySqlitePragmas；re-export；`getSqliteHardeningInfo` |
| `packages/server/src/__test-helpers__/test-db.ts` | 走同一 applySqlitePragmas |
| `packages/server/src/ops-snapshot.ts` | `OpsSnapshot.sqlite` + `buildOpsSqliteSnapshot` |
| `packages/server/src/orchestration/graceful-shutdown.ts` | 关停末尾 PASSIVE checkpoint；report.walCheckpointOk |
| `packages/server/src/db/sqlite-harden.test.ts` | **新建** unit：busy_timeout 读回 |
| `packages/server/src/ops-snapshot.test.ts` | mock + assert sqlite 字段 |
| `packages/server/src/routes/ops.test.ts` | mock + assert sqlite 字段 |
| `packages/server/src/orchestration/graceful-shutdown.test.ts` | checkpoint 调用 / 可跳过 |
| `packages/server/scripts/e2e-slice57-sqlite-harden.mts` | **新建** 进程内 pragma + live ops.sqlite |

## 命令证据

### Typecheck
```text
cd app/packages/server && pnpm exec tsc --noEmit
```
结果：clean

### Unit
```text
cd app && pnpm exec vitest run \
  packages/server/src/db/sqlite-harden.test.ts \
  packages/server/src/db/client.test.ts \
  packages/server/src/ops-snapshot.test.ts \
  packages/server/src/routes/ops.test.ts \
  packages/server/src/orchestration/graceful-shutdown.test.ts
```
结果：5 files / 28 tests **PASS**

### E2E
```text
cd app/packages/server && pnpm exec tsx scripts/e2e-slice57-sqlite-harden.mts
```
结果：**PASS**（5 checks：resolve / busy_timeout / FK / healthz / ops.sqlite）  
log：`app/.progress/logs/e2e-slice57-sqlite-harden-2026-07-27T06-45-35-539Z.log`  
注：Windows 上 process.exit 后偶发 `UV_HANDLE_CLOSING` assert（exit 127），检查项已全 PASS。

## Env

- `MA_SQLITE_BUSY_TIMEOUT_MS` — 默认 `5000`；非法/负数回落默认
- 现有 `DB_PATH` 不变

## Residual

- 未做 TRUNCATE checkpoint（用 PASSIVE，避免关停阻塞读者）
- 未换 PostgreSQL / 连接池 / 多 writer
- Slice 58 backup 未做
- 未 commit / 未 push（Owner）

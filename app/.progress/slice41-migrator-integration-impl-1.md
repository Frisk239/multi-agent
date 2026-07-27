# Slice 41 · 迁移单轨 + 关键路径集成测（R7）· closeout

> 2026-07-27 · Phase B R7 · **未 commit**

## 交付

| 路径 | 内容 |
|---|---|
| `app/packages/server/drizzle/0036_schema_gap_columns.sql` | 缺口列：`agent.allowed_paths` · `agent_run.parent_run_id` · `issue.custom_fields` · `automation_rule.cron_expression` · `memory_item.valid_at/invalid_at` |
| `drizzle/meta/_journal.json` | idx 36 条目 |
| `src/db/client.ts` | **删除** 全部启动 inline compat ALTER |
| `src/__test-helpers__/test-db.ts` | **删除** `applyCompatAlters`；仅 migrator |
| `src/db/schema-migrator.test.ts` | 漂移门禁：migrator-only 空库有关键列 + drizzle 可读写 |
| `src/orchestration/critical-path.integration.test.ts` | 3 条关键路径集成测（真 DB + 真函数） |

## Must

1. ✅ 新库只靠 migrator 到当前 schema（0036 补缺口；`next_attempt_at` 仍仅在 0035）  
2. ✅ inline ALTER 已从 `client.ts` / `test-db.ts` 拆除；旧库文档：`pnpm --filter @ma/server db:migrate`  
3. ✅ ≥3 集成/契约测：  
   - enqueue 硬闸 `cwd_missing` → skipped 且 **0** `agent_run` 行  
   - automation 同 `plannedAt` 双 dispatch → **同一** `automation_run`  
   - orphan running（无 live abort）→ failed 一次，再扫 0  
4. ✅ 漂移门禁 + typecheck 绿  

## 证据

```text
pnpm --filter @ma/server typecheck  → Done
pnpm exec vitest run packages/server → 36 files / 186 tests passed
  schema-migrator.test.ts            2
  critical-path.integration.test.ts  3
```

## 旧库

本地 `app/dev.db` 若停在 0035 之前或曾依赖启动 ALTER：升级后跑一次

```bash
pnpm --filter @ma/server db:migrate
```

若列已由历史 inline ALTER 加上而 journal 未记 0036，SQLite `ADD COLUMN` 可能报 duplicate——此时需对齐 `__drizzle_migrations` 或手工处理（本 slice 不自动 IF NOT EXISTS 兼容双轨）。

## 债 / Out

- 未生成 0036 snapshot JSON（journal+SQL 足够 migrator；与 0035 同风格）  
- Postgres 强制、重写 0000–0035、Playwright 全矩阵：Out  

## 下一刀

Slice 42 Deferred 升级（D5）或 plan 序 Slice 42/43

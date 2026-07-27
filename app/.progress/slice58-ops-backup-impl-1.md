# Handoff: slice58-ops-backup-impl-1

> 切片：`Slice 58 · Ops backup/export` · 角色：实现子代理 · 2026-07-27  
> 未 commit / 未 push

## 上下文

运维可调用 API 把当前主 SQLite 安全备份到可配目录，并列出历史备份。无 restore UI、不打包 wiki。

## 本会话完成了什么

### API
- `POST /api/ops/backup` — better-sqlite3 `.backup()` → 时间戳文件
- `GET /api/ops/backups` — 列出备份目录内 `.db`（name/path/size/mtime）
- 路由：`packages/server/src/routes/ops.ts`
- 逻辑：`packages/server/src/ops-backup.ts`

### 目录约定
- env `MA_BACKUP_DIR`（绝对或相对 cwd）优先
- 否则默认 `process.cwd()/.ma-backups`（与 wiki 的 cwd 风格一致）
- 文件名：`ma-backup-YYYYMMDDTHHMMSSZ.db`
- 禁止目标路径等于主库 / `-wal` / `-shm` / `-journal`
- `.gitignore` 增加 `.ma-backups/`

### 错误码
- `BACKUP_DIR_NOT_WRITABLE` (503)
- `BACKUP_FORBIDDEN_PATH` (400)
- `BACKUP_FAILED` (500)
- list：`BACKUP_DIR_NOT_READABLE` / `BACKUP_LIST_FAILED`

### 测试
- unit：`ops-backup.test.ts`（roundtrip size>0、list、forbidden、fail code）
- routes：`routes/ops.test.ts`（POST/GET mock）
- e2e：`scripts/e2e-slice58-ops-backup.mts` → `.progress/logs/`

### Out（未做）
- restore UI / 一键 restore
- Settings「创建备份」按钮（可选，优先 API）
- wiki 整包导出
- bind/token（59）、README 人类操作员段落

## 自测结果（必须有证据）

```
$ cd app/packages/server && pnpm exec tsc --noEmit
（无输出，exit 0）

$ pnpm exec vitest run src/ops-backup.test.ts src/routes/ops.test.ts
Test Files  2 passed (2)
Tests       13 passed (13)

$ pnpm exec tsx scripts/e2e-slice58-ops-backup.mts
summary pass=8 fail=0 skip=0
  live POST /api/ops/backup → size>0
  live GET /api/ops/backups → listed
log → app/.progress/logs/e2e-slice58-ops-backup-*.log
```

## 偏离

- 默认目录选 `.ma-backups`（非 `data/backups`），对齐 cwd 侧产物风格
- 未做 Settings 薄按钮（spec 标可选；API + unit + e2e 完整）
- e2e 脚本在 Windows 上避免瞬时 `process.exit` 触发 better-sqlite3/libuv abort

## 未做 / 债 / 合并注意

- 备份文件仅主库 snapshot，不含 wiki 文件树
- 无 prune/retention 策略
- live e2e 会在 server cwd 写 `.ma-backups/`（已 gitignore）

## 分支

- main 直接改 · 未 commit · 未 push

## 给下一 Owner

- 验收：tsc + vitest ops-backup + e2e-slice58；可选 curl POST/GET
- 建议下一主题：bind/token（59）或 Settings 备份按钮

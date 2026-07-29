# R4 mention 闭环完整性 · closeout · 2026-07-29

## 结论

R4 的最小闭环已由聚焦测试覆盖：comment mention 成功 enqueue 后写入带 `issueId` 和 Run payload 的 `mention_delegated` activity；ActivityTimeline 显示提及委派 badge，并可深链对应 Run。未生成 run 的 dispatch 不写该 activity。

参考：`references/deep/multica.md:156-190`。本仓继续复用单机 `eventBus` + `recordActivityLog` 广播，不移植 Multica 的分布式基础设施。

## 本次真实文件改动

- `packages/server/src/orchestration/comment-trigger.ts`
- `packages/server/src/orchestration/comment-trigger.test.ts`
- `packages/server/drizzle/0039_activity_log.sql`
- `packages/server/drizzle/meta/_journal.json`
- `packages/server/src/db/schema-migrator.test.ts`
- `packages/web/components/ActivityTimeline.tsx`
- `packages/web/components/ActivityTimeline.test.tsx`
- `packages/web/components/RunEventTimeline.test.tsx`（补齐过时的 `AgentRun` fixture，恢复 typecheck）
- 本 impl/closeout 文档

## 验收证据

实际执行的聚焦命令与结果：

```text
cd app
pnpm exec vitest run packages/server/src/orchestration/comment-trigger.test.ts
# PASS: 1 file, 2 tests

cd app/packages/web
pnpm exec vitest run --config vitest.config.ts components/ActivityTimeline.test.tsx
# PASS: 1 file, 1 test

cd app
pnpm typecheck
# PASS: shared / server / web
```

未执行全仓 build / 全量测试，也未 commit/push。`git diff --check` 通过。

## 剩余风险

- 已验证真实 API mention enqueue 与浏览器活动流；未等待本机 CLI 将该 Run 执行到终态。
- `recordActivityLog` 捕获 DB 写入异常，因此 enqueue 成功但 activity 写入失败时不会回滚 run；沿用现有 best-effort activity 语义。

## Fresh DB migration follow-up

浏览器验收真实发现 fresh DB 缺少 `activity_log`，activities API 因 `no such table` 返回 500。已新增 `0039_activity_log.sql`，未修改旧 migration。

实际证据：

```text
cd app
pnpm exec vitest run packages/server/src/db/schema-migrator.test.ts
# PASS: 1 file, 2 tests

$env:DB_PATH = 'C:\Users\a2691\AppData\Local\Temp\ma-r4-fresh-019fae48.db'
pnpm --filter @ma/server db:migrate
# ✓ 迁移完成

sqlite3 C:\Users\a2691\AppData\Local\Temp\ma-r4-fresh-019fae48.db ".schema activity_log"
# 输出 activity_log CREATE TABLE、issue_id -> issue(id) ON DELETE CASCADE
# 以及 CREATE INDEX idx_activity_log_issue
```

迁移风险：现有旧库若曾由非 migration 的其他方式手工创建同名表，0039 会因表已存在而失败；标准 journal 管理的数据库与 fresh DB 不受影响。

## Owner 最终路径验收

使用 `.tmp-r4-verify/r4.db` 从空库执行全部 migrations + seed 后：

1. `POST /api/issues/<FRI-07>/comments`，body 含 `mention://agent/agt-research`。
2. API 返回 `dispatches[0].runId = 2a6b4305-...`、`note = 已排队`。
3. Playwright CLI 打开 FRI-07 全页详情，切到“活动事件流”。
4. 页面出现“提及委派”和 `查看 Run 2a6b4305`。
5. 点击后 URL 为 `/runs?run=2a6b4305-9bd4-4c5c-84d3-32fafa2d7e52`；该次 reload / click 控制台为 0 errors。

结论：fresh install migration、mention enqueue、activity 持久化/API、前端 badge 与 Run 深链已端到端闭环。

# G2-5 全局并发配额 —— closeout（2026-08-03）

**刀名：** G2-5 全局并发配额（workspace 级在途上限，纯增量）
**Goal：** G2（编排闭环）/ 剩余小刀收尾

## 落地改动

1. **schema + migration**：`db/schema.ts:15-21` workspaces 表加 `maxConcurrentRuns: integer('max_concurrent_runs')`（null=不限）；migration `drizzle/0050_workspace_max_concurrent_runs.sql`（`ALTER TABLE workspace ADD max_concurrent_runs integer`）+ `drizzle/meta/_journal.json` idx 50（when=1788276400000，> 0049）。按仓库既有方式手写 SQL + journal 条目（0046-0049 均无 snapshot，未跑 drizzle-kit generate 避免全量 diff）。
2. **run-worker 拦 claim**：`orchestration/run-worker.ts:122-133` tick() 循环外**一次**查 `workspaces` 配额 + 全局 `COUNT(*) WHERE status='running'` 作基数；`run-worker.ts:186-188` claim 前（原 :177 前）`if (globalMax !== null && globalActive + claimedThisTick >= globalMax) continue`；`run-worker.ts:216` 成功 claim 后本地 `claimedThisTick += 1`（同 tick 不超发，不重复查 DB）。语义：**拦 claim 不拦 enqueue**，queued 保持排队。
3. **settings 路由**：`routes/settings.ts:96-106,181` calculateRunHealth 增 `maxConcurrentRuns` 参数（默认 null，旧调用兼容）、buildRunHealth 透出；`routes/settings.ts:671-694` POST /api/settings/workspace-cwd 支持 body 可选 `maxConcurrentRuns`（正整数或 null）更新该列并回读。
4. **shared 类型**：`shared/schema.ts:1935` SettingsRunHealth.maxConcurrentRuns；`:1995` SetWorkspaceCwdInput.maxConcurrentRuns。
5. **Web**：`web/components/SettingsPage.tsx:583-606` 工作区卡加「全局在途上限」输入（data-testid=max-concurrent-runs，空=不限，文案明确「排队不算在途」），保存路径按钮一并提交（`:554`）；`web/lib/api.ts:2736-2755` useSetWorkspaceCwd 改 `{ path, maxConcurrentRuns? }`。

## 测试与实证

- `orchestration/run-worker.test.ts` 新增 3 用例（真实迁移 DB + fake backend + 直接驱动 tick）：
  - 全局满 → queued 不 claim（running=配额，tick 后 executeCalls=0、status 仍 queued）
  - 同 tick 不超发（配额 1 + 两条 queued → 仅 claim 1 条，余量留下一 tick；execute 挂起验证）
  - 配额 null → 不限（两条 queued 均 claim 完成）
- `routes/settings.onboarding.test.ts` 既有 calculateRunHealth 用例回归通过（新参数默认 null 兼容）。
- 门禁全量：`pnpm typecheck` 全绿（shared/server/web）；`pnpm test` shared 121 / server 838 / web 442 全绿（server +7 = 本刀 3 + G1-5 4）。
- 真机：dev.db 已跑 `db:migrate` 应用 0050（safe-live-restore 测试走真实 client 依赖 dev.db 列，迁移后全绿）。

## 决策

- 配额只拦 claim（queued 保持排队），不拦 enqueue——与 per-agent `concurrency` 语义一致，入口不感知配额。
- 同 tick 内用本地 `claimedThisTick` 计数而非循环内重复 COUNT（better-sqlite3 同步写，claim 即真实）；跨 tick 每次重查，天然自愈。
- 保存端点复用 POST /api/settings/workspace-cwd（工作区保存处），`maxConcurrentRuns` 缺省=不改动配额；重置 path 不清配额。

## 下一刀建议

G1–G5 池仅剩 G1-2 ACP 大工程（唯一剩余）；G2-5 无后续。可选小项：配额生效后 UI 健康卡展示「在途 x/上限 y」（当前仅透出 maxConcurrentRuns，展示层未画比例）。

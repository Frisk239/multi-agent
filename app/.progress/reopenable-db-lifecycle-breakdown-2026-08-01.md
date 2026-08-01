# reopenable-db-lifecycle · 拆解与下一会话起点（2026-08-01）

> 状态：**未实施（设计拆解）**。本刀是仓库级基础设施重构（安全 live restore 的解锁前置），
> 按宪法「特大/特雾 → 下一会话 Owner 做深」在本会话仅完成现状核实与拆解，供下一会话直接开工。

## 目标（CONTEXT.md:51 原文）

统一动态 DB accessor、worker stop/start、memory sqlite provider 绑定和 active run recovery terminal；
完成后才能实现 maintenance → rollback snapshot → 原子 DB/Wiki 换入 → migrate/integrity → applied/rolled_back。

## 现状核实（2026-08-01 实测）

| 项 | 现状 | 出处 |
|---|---|---|
| DB 单例 | `db/client.ts` 模块级 `new Database(DB_PATH)` + drizzle，**进程内不可替换** | `db/client.ts:21-27` |
| import 面 | **58 个文件** import `db/client.js`（其中 `import { db }` 51 个；`sqlite` 直接使用点：issues.ts reorder/delete/bulk 的 `sqlite.transaction`、`sqlite.prepare` 等） | `grep -l "db/client" src/**/*.ts` |
| 维护 seam | 上一刀已建：maintenance 模式可阻断普通写请求 + verified snapshot 可生成恢复影响预览 + durable journal | `safe-restore-readiness-closeout-2026-07-30.md` |
| worker | `run-worker.ts` 有 `startRunWorker/stopRunWorker`（`tick()` 已导出供测试）；automation-worker 同款 | `run-worker.ts:71-96` |
| memory | `memory/manager.ts` 的 sqlite provider 绑定启动时的 DB 实例 | `memory/manager.ts` |
| active run | 恢复时在途 run（running/queued）需要 terminal 化或重排 | `run-worker.ts` ACTIVE_RUN_STATUSES |

## 拆解（建议顺序）

### D1 · 动态 DB accessor（核心，最大面）
- `db/client.ts` 重构：`let current: { sqlite, db }` + `getDb()/getSqlite()` accessor + `swapDatabase(path)`（关旧连接、开新连接、pragmas、重建 drizzle）
- **消费方改造策略**：58 个 import 面不能手工全改 —— 评估两条路：
  a. **保持 `export const db` 命名但改成 getter**（`export const db = { get ... }`？drizzle 的查询构造走 `db.select()`——getter 只在模块求值时取一次，不行）
  b. **运行时替换**：`let sqlite`/`let db` 用 `export let` + swap 函数重赋值（ESM live binding：`import { db }` 的消费方拿到的是模块命名空间引用——`export let db` 重赋值后 `import { db }` 处取到新值？**不行**，ESM 的 `import { db }` 是绑定快照……实际上 ESM live binding 对 `export let` 是活的（更新可见），drizzle 查询调用 `db.select()` 每次调用时读绑定 → 可行！**关键验证点：`export let db` + swap 重赋值，消费方 `import { db }` 在 swap 后是否拿到新实例**（ESM live binding 语义：是。但 drizzle 链式调用中途 swap 不安全——maintenance seam 已阻断写，窗口可控）
  c. 兜底：drizzle 实例不换，只换底层 better-sqlite3 连接？drizzle 对 better-sqlite3 是构造时绑定 database 实例，不可换 → 必须换 drizzle 实例
- **建议 D1 采用 b（`export let` + live binding 验证单测）**；验证不成立再退 a（改全部 import 面——58 文件机械替换，风险高）
- 测试：swap 后新连接可查、旧连接已关、pragmas 应用、WS 订阅/内存缓存（eventBus/activity 等无 DB 引用面）不受影响

### D2 · worker stop/start
- 复用既有 `startRunWorker/stopRunWorker` + automation-worker 同款；swap 期间 stop → swap 后 start
- `tick()` 已导出（W5），可单测「stop 后不再 claim、start 后恢复」

### D3 · memory sqlite provider 重绑定
- `memory/manager.ts` 的 sqlite 连接改为从 accessor 取或支持 rebind；swap 后 ambient/curated 写新库

### D4 · active run recovery terminal
- swap 前把 running/queued run 终态化（`reopened_due_to_restore` 语义）或重启后按 rerun 语义重排
- 参考 stale-runs 既有收尸（`stale-runs.ts`）复用模式

### D5 · maintenance → rollback snapshot 闭环（主线完成后）
- 复用 verified stage + journal：maintenance → swap → 原子 DB/Wiki 换入 → migrate/integrity → applied/rolled_back
- 本会话**不做**（依赖 D1-D4）

## 风险与提示

- **D1 的 live binding 是成败关键**：先写一个 10 行的验证单测（export let db + import 方 swap 后可见）再动工；不行就退 a 方案（58 文件机械替换，用 codemod 脚本防手误）
- swap 窗口与 maintenance seam 配合：只允许 maintenance 模式下 swap（写已阻断）
- `sqlite.transaction` 直接使用点（issues.ts 等约 10 处）必须同步走 accessor，漏一处 = 换库后写旧连接
- 完成后 CONTEXT.md「刻意不做」的 live restore 全量 swap 条目可删除

## 验收（下一会话）

- D1 验证单测绿 + swap 端到端（旧库数据不可见、新库可见）
- D2 stop/start 单测 + 手动（swap 期间 run 不被 claim）
- D3 重绑定后 memory 写新库
- D4 active run 终态化（无 dangling running）
- server 全量 vitest + typecheck 绿；CI（W4 已加 pnpm test）兜底

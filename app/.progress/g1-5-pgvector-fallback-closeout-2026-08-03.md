# G1-5 pgvector 软回退可观测 —— closeout（2026-08-03）

**刀名：** G1-5 Memory/Wiki 降级可观测（本刀只做 Memory：pgvector 启动软回退的状态标记与透出）
**Goal：** G1（执行层诚实性）/ 剩余小刀收尾

## 落地改动

1. **manager 状态标记**：`memory/manager.ts:48-64` MemoryManagerStatus 加 `degraded: boolean` + `degradedNote?: string`；`:78-93` 加 `markFallback(reason)`（幂等，只记录第一条原因）；`:256-257` getStatus 带上两字段。
2. **启动回退打标**：`index.ts:31-58` initMemoryProvider 两个降级分支（pgvector unavailable / initialize 抛错）均改调 `memoryManager.markFallback('pgvector 初始化失败：…')`；`console.warn` 改结构化 `logger.warn({provider, fallback, err}, msg)`（对齐 run-worker.ts:698 logger 用法），`console.log` 同步改 `logger.info`。
3. **settings 透出**：`routes/settings.ts:267-268` buildMemoryHealth 透出 degraded/degradedNote（函数已导出供单测）；`:400-414` 诊断分支：`degraded → status='warn'` + detail 固定文案「MEMORY_PROVIDER=pgvector 初始化失败，已回退 sqlite-text」。
4. **shared 类型**：`shared/schema.ts:1973-1975` SettingsMemoryHealth.degraded + degradedNote（optional，旧客户端兼容）。
5. **Web 徽标**：`web/components/SettingsPage.tsx:1077-1084` 记忆层健康卡标题旁降级徽标（data-testid=memory-degraded-note，文案「已降级回退 sqlite-text」，title=原因）。`routes/memory.ts:15` getStatus 经由 manager 自动带上 degraded，无需改。

## 测试与实证

- `memory/manager.test.ts` 新增 G1-5 用例：默认未降级（degraded=false、note=undefined）→ markFallback 后 true + note 透出 → 二次 markFallback 幂等保留首条。
- `routes/settings.memory-health.test.ts`（新，3 用例，mock db + memoryManager）：buildMemoryHealth degraded 透出；buildSettingsStatus degraded → memory 检查 warn + 固定 detail；未降级 → ok。
- 门禁全量：`pnpm typecheck` 全绿；`pnpm test` shared 121 / server 838 / web 442 全绿（server +7 = G1-5 4 + G2-5 3）。
- 实证路径（模拟降级）：`MEMORY_PROVIDER=pgvector` + 无 PG → 启动日志 `[memory] provider=sqlite-text`（warn 结构化行含 provider/fallback），`GET /api/settings/status` memoryHealth.degraded=true，Settings 记忆卡显徽标。

## 决策

- **只做启动时降级标记，不做运行时切换**：pgvector 与 sqlite-text 是两套物理存储（pg 连接串后端 vs 主库表），运行时 breaker 打开自动切 provider 会把已写数据分叉（pgvector 侧新记忆对 sqlite 检索不可见），留后续刀（需显式迁移/双写策略）——roadmap §5 精神：不做「无条件切换」。
- markFallback 幂等记录首条原因：后续多次回退不覆盖原始失败，诊断可追溯。
- 未降级时 degradedNote 为 undefined（非 null）：JSON 响应更干净，web 端 `?.` 安全。

## 下一刀建议

G1–G5 池仅剩 G1-2 ACP 大工程（唯一剩余）。可选小项：Wiki 侧「无 LLM key」降级提示已在 G4-3 闭环；本刀未覆盖运行时自动切换（数据分叉风险，需显式设计）。

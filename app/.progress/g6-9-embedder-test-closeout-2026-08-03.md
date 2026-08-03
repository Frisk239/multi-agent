# G6-9 memory pgvector/embedder 测试 —— closeout（2026-08-03）

**刀名：** G6-9 memory pgvector/embedder 测试（provider 选择/软回退分支钉死）
**Goal：** G6（后端执行与运营精细度）/ 第八波第八刀（§3 池取用，纯测试刀）

## 现状基线（开工前核对）

- `memory/embedder.ts`（getEmbeddingConfig / embedTexts / embedQuery / vectorLiteral）**零测试覆盖**——无 key、HTTP 失败、dims 不匹配等降级分支无网可拦（embedder 是 pgvector 上游，坏分支会让 G1-5 软回退行为失真）。
- `memory/manager.test.ts` 已覆盖 G1-5 markFallback（降级标记）+ breaker（8 用例）→ provider 侧选择/降级已有网；本刀补 embedder 全文件 + 回归确认 manager 侧。

## 落地改动（纯测试刀，无生产代码改动）

`memory/embedder.test.ts`（新，10 用例）：
- **getEmbeddingConfig**：默认（key 空 / openai 官方端点 / text-embedding-3-small / 1536 dims）；`EMBEDDING_*` 优先 `OPENAI_*` 回退；baseURL 尾斜杠剥除。
- **embedTexts**：无 key 诚实 throw（不静默发空请求）；空数组 → [] 且不 fetch；HTTP 401 → throw 带状态码+响应体；**dims 不匹配 → throw**（防向量列错维度写入，pgvector 上游守卫）；成功按 index 排序 + Authorization 头 + body 形状。
- **embedQuery** 单元素；**vectorLiteral** pgvector 字面量格式。

## 测试与实证

- 门禁全量：`pnpm typecheck` 全绿；`pnpm test` **shared 121 + server 954 + web 465 = 1540 全绿**（1530 + 10）。
- manager.test.ts 8 用例回归绿（G1-5 降级标记行为未漂移）。

## 决策记录

1. **dims 守卫是生产语义，测试配 env 对齐**：mock 数据用 1-2 维 embedding 时设 `EMBEDDING_DIMS` 匹配——守卫本身在测试中被证实有效（防回归）。
2. **fetch 用 vi.stubGlobal 而非 vi.mock**：embedder 无依赖注入，全局 fetch 桩最小侵入；afterEach unstub 防跨用例泄漏。

## 下一刀建议

§3 池剩余：**G6-7 Automation 连续 skipped 运营警示**（Settings 规则标黄 + 文案）· **G6-5 消息/列表端点分页**。G6 目标陈述四条已全部落地（调度公平 G6-1 / 幂等占位 G6-2 / 可观测 G6-4·6·8·10 / 盲区清零 G6-3·4·9）；剩余两刀为低价值池尾，可留给后续会话或按痛点取用。

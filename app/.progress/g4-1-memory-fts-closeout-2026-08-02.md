# G4-1 记忆检索 FTS5 升级 closeout（2026-08-02）

> Goal G4 知识/记忆 · roadmap §4 队列第 5 刀（决定记忆层长期可用性的根本问题）。状态：**已关 ✅**

## 目标

记忆检索不再受「最近 200 条内存过滤」硬上限约束（记忆积累越多检索越退化）→ SQLite FTS5 全量索引化检索；顺带 scope 加权 + score 落库。

## 关键事实（探索实测）

- better-sqlite3（SQLite 3.53.2）**ENABLE_FTS5 已编译开启**，`:memory:` 测试库同样可用
- **裸 unicode61 会把连续 CJK 整串当一个 token**（插入「用户说问题已解决」后 MATCH '问题' 命中 0）；trigram 对 2 字查询失配 → 必须存 gram 化文本（与既有 `tokenize()` 双字 gram 约定一致）
- gramify 无法用 SQL 触发器表达（外部内容表触发器是纯 SQL）→ **放弃触发器方案**

## 设计决策（Slice Owner 拍板）

| 决策 | 选择 | 理由 |
|---|---|---|
| FTS 表形态 | 独立虚拟表 `memory_item_fts`（存 gram 化文本，rowid 关联 memory_item），非 external content | 触发器中无法调用 JS gramify；外部内容表无触发器则退化 |
| 同步策略 | **写路径同步**（addRaw/deleteById 3 处）+ `initialize()` 幂等全量重建回填兜底 | 写路径仅 3 处可控；重建兜底覆盖换库/测试重建/绕过 provider 直插场景（实测重启后直插数据被召回） |
| 检索 | FTS MATCH（token join，隐式 AND = 原全 token AND 语义）+ BM25 候选 100 条 + JS 二次重排 | 保留既有 2 字 gram 检索行为连续性 |
| 重排 | `score = bm25 + (scopeWeight-1)*0.5 + recency*0.3`（30 天衰减） | scope 加权（workspace 1.0/agent 1.1/issue 1.2/run 1.3）只加权重不建多维（G4-4）；时间衰减贴合「经验时效」 |
| 迁移文件 | **不需要 0049**：FTS 表由 initialize() 运行时幂等创建 | 运行时重建比迁移更可靠（任何库/换库场景一致）；gramify 需求使迁移触发器方案不成立 |
| 空查询 | 保留「最近 N 条」路径（原样） | 与 manager 托底语义兼容 |

## 改动

| 文件 | 改动 |
|---|---|
| `memory/sqlite-text-provider.ts` | `FTS_TABLE` 常量；`initialize()` 幂等 DROP+CREATE FTS5 + 全量回填 gram 化文本；`prefetchSync` 有 token 分支改 FTS MATCH（BM25 候选 100）+ invalid 过滤 + scope 加权/时间衰减重排 + **填 score**；`addRaw`/`deleteById` 同步 FTS（lastInsertRowid/rowid）；空查询分支不变 |
| `memory/sqlite-text-provider.test.ts` | 修 beforeEach（重建基表后重调 initialize）；新增 8 用例：FTS 表存在 / gram 化规则 / **>200 行召回回归** / CJK 2 字命中 / 多 token AND / invalid 排除与包含 / delete 同步 / score+排序 |

## 真机验收（dev.db 实库）

1. **>200 行上限移除（核心）**：种 230 条噪声 + 1 条 200 天前含唯一 token 的记忆（`fts5-flag-2026`）→ 重启（initialize 回填）→ 查询命中该老记忆 ✅（旧实现 200 行窗口必然漏掉）
2. **写路径同步**：POST /api/memory 写入 → GET ?q= 立即命中 ✅
3. **initialize 全量回填兜底**：绕过 provider 直插的 231 条 → 重启后全部可检索 ✅
4. **CJK 双字 gram**：`?q=噪声记忆`（URL 编码）→ 20 条命中 ✅

## 门禁

- server 全量 **703 passed**（0 FAIL）；provider 测试 10/10（8 新）
- 无 schema/迁移改动（FTS 是运行时对象）→ shared/web 零改动

## 未做（后续刀）

- G4-4 Memory scope 多维精化（四级 scope 写入 + 检索过滤；本刀只加权重）
- G4-2 流式围栏 scrubber（下一刀）
- pgvector provider 的检索升级（本刀只动 sqlite-text；pgvector 已有向量检索）

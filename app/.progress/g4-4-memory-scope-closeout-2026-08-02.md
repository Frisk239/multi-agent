# G4-4 Memory scope 多维精化 closeout（2026-08-02）

> Goal G4 知识/记忆 · Goal 第二波 M3 末刀。状态：**已关 ✅**

## 目标

四级 scope 写入（带 scope 标签）+ 检索按 scope 过滤 + 注入跳过原因可观测（B-10，参考 mem0 User/Session/Agent/Run）。

## 勘察结论

- `memory_item.scope` 列早已存在（默认 'workspace'），G4-1 只做了检索端 SCOPE_WEIGHT 加权（workspace 1.0 → run 1.3），**无过滤、无写入方语义**——全部写入路径硬编码 'workspace'。
- 无 scope 枚举；CreateMemoryInput 无 scope 字段；route 响应硬编码 'workspace'；/memory 页零 scope 痕迹。

## 设计（Slice Owner 拍板）

| 决策 | 选择 | 理由 |
|---|---|---|
| 四级枚举 | shared `MemoryScope = workspace/agent/issue/run` | B-10 定义（mem0 User/Session/Agent/Run）；CreateMemoryInput.scope optional，zod 拒绝非法值 |
| 写入标签 | curated：显式 scope ??（有 issueId → issue，否则 workspace）；ambient comment/issue_done → issue；run 完成 → run（syncTurn 加 scope 字段）；addRaw 默认 workspace | 与「这条记忆关于什么」的真实维度对齐；agent scope 预留给未来 agent 经验 ambient |
| 检索过滤 | GET /api/memory?scope= + provider.prefetch opts.scope；sqlite 空查询（drizzle and() 合并）+ FTS 路径（SQL 条件拼接，参数化）+ pgvector（SQL 注入转义）双实现；非法 scope 忽略 = 全量 | 过滤是可选维度；prefetchForIssue 注入**不加** scope 过滤（保持召回广度，roadmap 只要求检索过滤） |
| 跳过原因可观测 | 维持现状（console.warn + breaker 状态）；AccessLog 薄版未做 | 超出验收最小集；记入未做 |

## 改动

| 文件 | 改动 |
|---|---|
| shared schema.ts | MemoryScope 枚举 + CreateMemoryInput.scope |
| memory/types.ts | MemoryItemView.scope、MemorySyncInput.scope、prefetch opts.scope |
| sqlite-text-provider.ts | prefetchSync 空查询/FTS 双路径过滤；addRaw/syncTurn scope 写入；视图带 scope |
| pgvector-provider.ts | 同上（SQL 参数化 + 转义） |
| memory/manager.ts | search(+scope)、addCurated(+scope 缺省语义)、ambientCapture→issue、syncRunCompleted→run |
| routes/memory.ts | GET ?scope= 过滤；POST/详情 scope 真实回读（不再硬编码） |
| web api.ts + MemoryPage.tsx | useMemoryList/useCreateMemory scope；搜索栏筛选（?scope= 可分享）+ 创建表单选择 + 行内 scope 标签 + active chip |
| 测试 | sqlite +4（写入标签/空查询过滤/FTS 过滤/默认值）、manager scope 链路（ambient=issue/curated 缺省/显式/run sync）、contract +4（回读/默认/过滤参数/非法 400） |

## 真机验收（dev.db + 本地 server + Playwright）

1. POST /api/memory `{scope:'run'}` → 响应 `"scope":"run"`；缺省 → `"scope":"workspace"` ✅
2. GET ?scope=run → 仅 run 标签；?scope=workspace → 全 workspace；全量 → 混合（且出现有机的 issue 标签——ambient 写入生效）✅
3. UI /memory：行内 scope 标签（全局/Run/Issue）、筛选下拉（全部/全局/Agent/Issue/Run）、创建表单下拉；选 Run 后列表只剩 2 条 Run ✅
4. 证据：`.playwright-cli/m1-g44-memory-scope-filter.png`（demo 记忆已清理）

## 门禁

- server 741 / shared 121 / web 425（monorepo 1287）；typecheck 全仓绿

## 未做（后续刀）

- 检索 AccessLog 薄版（注入跳过原因落库）——B-10 后半，当前 console.warn 可观测
- agent scope 的有机写入源（agent 经验 ambient 尚无；枚举 + UI 已支持手动）
- pgvector 端到端（本机无 PG；SQL 路径与 sqlite 同构实现，参数化 + 转义已测语法路径）

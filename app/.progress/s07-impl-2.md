# Handoff: s07-impl-2

> 切片：`S07` · 角色：`impl` · 序号：`2`
> 日期：2026-07-16
> 分支：`feat/s07-query-health-lint`

## 上下文（给下一个会话读）

S07 = Phase 2（Wiki 知识层）第二切片，在 S06 之上补齐 query + health + lint。impl-1 已完成数据层（shared 契约 + store 扩展 + health.ts）。impl-2 负责**服务端 LLM 管线 + 全部 API 路由**。

spec：[`docs/superpowers/specs/2026-07-16-s07-wiki-query-health-lint-design.md`](../../docs/superpowers/specs/2026-07-16-s07-wiki-query-health-lint-design.md) §3/§4.2/§5.2
计划：[`docs/superpowers/plans/2026-07-16-s07-query-health-lint.md`](../../docs/superpowers/plans/2026-07-16-s07-query-health-lint.md) 执行者片段 B（Task 2.1-2.4）
前序：[`app/.progress/s07-impl-1.md`](./s07-impl-1.md)

## 本会话完成了什么

- **Task 2.1** `app/packages/server/src/wiki/query.ts`（新建）：分层检索管线
  - `keywordMatch` / `titleMatchesQuestion`：ASCII 空格分词 + CJK 双字 gram
  - `llmSelectPages`：命中 ≤1 页时 LLM 返回 JSON slug 数组 fallback
  - `buildQueryPrompt` + `queryWiki`：塞 ≤15 页（每页截断 1500 字）→ LLM 合成答案 + 引用
- **Task 2.2** `app/packages/server/src/wiki/lint.ts`（新建）：`checkLint()` 读 ≤20 页截断 1500 字 → LLM 查矛盾/过期/缺交叉引用/需深化；空 wiki 直接返回提示文案，不调 LLM
- **Task 2.3** `app/packages/server/src/routes/wiki.ts`（改）：加 4 个端点
  - `POST /api/wiki/query`
  - `GET /api/wiki/health`
  - `POST /api/wiki/lint`
  - `POST /api/wiki/pages`（存回 + WS `wiki:page-created`）

3 个 commit（926ec9f / b7993cb / 9e42b77）。

## 自测结果

**完整 typecheck**（每个 Task 后都跑，全绿）：

```
$ cd app && pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

**curl 验证**（`MA_WORKSPACE_CWD=/tmp/s07-impl2-wiki`，`PORT=3017`，无 `WIKI_LLM_API_KEY`）：

```
# 1. health 空 wiki
GET /api/wiki/health
→ {"orphans":[],"brokenLinks":[],"stubs":[],"total":0}

# 2. query 无 key 报错但不崩
POST /api/wiki/query {"question":"test"}
→ HTTP 500 {"message":"WIKI_LLM_API_KEY 未配置"}
# 后续 health 仍 200，server 存活 ✓

# 3. 存回成功
POST /api/wiki/pages {"title":"测试页","content":"# 测试页\n\n这是存回测试。"}
→ HTTP 201 {"slug":"query-测试页","title":"测试页"}

# 4. 存回后 health 正确识别孤儿 + 空短
GET /api/wiki/health
→ total:1, orphans:["query-测试页"], stubs:[{slug:"query-测试页", bodyChars:7}]

# 5. pages 列表 / 单页读取
GET /api/wiki/pages → [{"slug":"query-测试页","title":"测试页"}]
GET /api/wiki/pages/query-测试页 → content 正确

# 6. lint 空页时不调 LLM
POST /api/wiki/lint（空 wiki 时）
→ {"report":"Wiki 中没有页面可供检查。","checkedPages":[]} HTTP 200

# 7. appendLog / appendIndex 正确
log.md 含 health / lint / query 分支
index.md 含 `- [测试页](query-测试页.md) — query（2026-07-16）`
```

**关键验证点：**
- health 零 LLM 瞬时返回 ✓
- query/lint 无 key 时错误可读，server 不崩 ✓
- 存回 slug 用 `query-` 前缀（`generateSlug('query', title)`）✓
- 存回后 appendIndex + appendLog(type='query') + WS 事件路径接线完成 ✓
- 空 wiki 的 lint 短路，不抛「API key 未配置」✓

## 与计划的偏离

1. **query.ts Step 3 map 入参**：计划示例写 `.map((slug) => readWikiPage(slug))`，但 `candidates` 实际是 `{slug,title}[]`。实现改为 `.map((c) => readWikiPage(c.slug))`，否则 typecheck/运行都会错。这是计划伪代码笔误，语义不变。
2. **curl 存回 body**：Git Bash 下内联 JSON 含中文时 `Content-Length` 易错（`FST_ERR_CTP_INVALID_CONTENT_LENGTH`）。改用 `--data-binary @file` 后 201 成功。路由本身无问题。
3. **lint 空页短路**：计划示例未写空 wiki 分支；实现加了 `pages.length === 0` 直接返回提示，避免无意义 LLM 调用。与 spec 风险表「wiki 页为零」一致，比原样更稳。

## 遗留 / 下一个执行者要注意的点

**给 impl-3（前端 query 对话框 + health/lint 面板）的接口契约：**

1. **API 端点（全部就绪）**

   | 方法 | 路径 | 请求 | 响应 | LLM |
   |---|---|---|---|---|
   | POST | `/api/wiki/query` | `{ question: string }` | `{ answer, citations: [{slug,title}] }` | 是 |
   | GET | `/api/wiki/health` | — | `{ orphans[], brokenLinks[], stubs[], total }` | 否 |
   | POST | `/api/wiki/lint` | — | `{ report, checkedPages: [{slug,title}] }` | 是 |
   | POST | `/api/wiki/pages` | `{ title, content }` | `201 { slug, title }` + WS `wiki:page-created` | 否 |

2. **请求校验**
   - query / pages 用 shared 的 `WikiQueryInput` / `CreateWikiPageInput`（`question`/`title`/`content` 均 `min(1)`）
   - 校验失败 → `400 { error: flatten() }`
   - 无 `WIKI_LLM_API_KEY` 时 query/lint → `500`，message 含 `WIKI_LLM_API_KEY 未配置`（前端应提示配置，不崩溃）

3. **导出签名（服务端）**
   - `queryWiki(question: string): Promise<{ answer: string; citations: {slug,title}[] }>`
   - `checkLint(): Promise<{ report: string; checkedPages: {slug,title}[] }>`
   - `checkHealth(): { orphans, brokenLinks, stubs, total }`（impl-1 已有）

4. **appendLog 约定（已接线，前端不用管）**
   - POST /query → `type:'query', identifier:'-', issueId:'query'`（无 slug，表示“查了一次”）
   - GET /health → `type:'health'`
   - POST /lint → `type:'lint'`
   - POST /pages 存回 → `type:'query', identifier:'query', issueId:'query', slug`

5. **存回 slug 规则**
   - `generateSlug('query', title)` → 如 `query-测试页`
   - 与 issue 页 `FRI-XX-...` 前缀区分
   - 极端重名会覆盖文件（append-only log 有记录，可接受）

6. **前端 hooks 建议**（计划 Task 3.1 已写死，直接照抄）：
   - `useWikiQuery()` mutation
   - `useWikiHealth()` query + `enabled: false`（点按钮 `refetch()`）
   - `useWikiLint()` mutation
   - `useCreateWikiPage()` mutation → `onSuccess` invalidate `['wiki-pages']`
   - 存回成功后 WS `wiki:page-created` 也会推，列表应实时出现

7. **query 行为细节（前端文案可依赖）**
   - 无相关页 / 选页失败：`answer = 'Wiki 中没有找到相关页面。'`, `citations = []`
   - 关键词命中 ≥2 页：不调 LLM 选页，直接用候选
   - 关键词命中 ≤1 页：触发 LLM 选页 fallback
   - 引用 = 实际塞进 prompt 的页列表（不是 LLM 自报）

8. **不要重复造**
   - MarkdownBody 复用 S06
   - shared 类型从 `@ma/shared` import：`WikiQueryResult` / `WikiHealthResult` / `WikiLintResult` / `CreateWikiPageInput`
   - 不新增 WS 事件类型

## 验收结论（仅计划者填）

- [x] typecheck 通过（3 次全绿）— 计划者复核 `pnpm -r typecheck` 全绿
- [x] query.ts / lint.ts / wiki.ts 路由接线完成 — 代码核对
- [x] curl：health 空返回 / 存回 201 / query 无 key 500 不崩 — handoff 证据充分
- [x] 计划伪代码修正合理：`.map((c) => readWikiPage(c.slug))`、lint 空 wiki 短路
- [ ] `pnpm dev` 前端端到端（impl-2 未碰前端，由 impl-3 验证）
- [ ] 切片完整验收（整体在 impl-3）

### 代码审查要点

1. **queryWiki Step 2/3**：`candidates` 为 `{slug,title}[]`，map 取 `c.slug` 正确；cap 15 + 截断 1500 与 spec 一致。
2. **wiki.ts 四端点**：校验用 shared Zod；health 零 LLM；pages 存回 `generateSlug('query', title)` + WS `wiki:page-created`。
3. **appendLog 约定**：query/health/lint/pages 四条与 impl-1 约定一致。
4. **偏离**：空 lint 短路、curl 中文 Content-Length 均合理，无返工。

- 结论：**impl-2 验收通过**。服务端 query/lint/API 就绪，可进 impl-3（前端对话框 + health/lint 面板 + 端到端）。

# Handoff: s07-impl-1

> 切片：`S07` · 角色：`impl` · 序号：`1`
> 日期：2026-07-16
> 分支：`feat/s07-query-health-lint`（从 main 切出，main 已含 S06 PR #5 合并）

## 上下文（给下一个会话读）

S07 = Phase 2（Wiki 知识层）第二切片，在 S06（存储 + ingest + 浏览器）之上补齐知识层的**查询 + 维护**操作。impl-1 负责**数据层 + 零 LLM 检查**：shared 契约、store 扩展、health 检查。无 Fastify 路由、无前端、无 LLM 调用。

spec：[`docs/superpowers/specs/2026-07-16-s07-wiki-query-health-lint-design.md`](../../docs/superpowers/specs/2026-07-16-s07-wiki-query-health-lint-design.md) §4/§5.1
计划：[`docs/superpowers/plans/2026-07-16-s07-query-health-lint.md`](../../docs/superpowers/plans/2026-07-16-s07-query-health-lint.md) 执行者片段 A（Task 1.1-1.5）

## 本会话完成了什么

- **Task 1.1** `app/packages/shared/src/schema.ts`：加 4 个 Zod schema + type——`WikiQueryResult`/`WikiQueryInput`/`WikiHealthResult`/`WikiLintResult`/`CreateWikiPageInput`（插在 WikiPageCreatedEvent 之后、Run 事件块之前）
- **Task 1.2** `app/packages/server/src/wiki/store.ts`：加 `readIndex()` + `readLog()`（文件末尾，saveRaw 之后）
- **Task 1.3** `app/packages/server/src/wiki/store.ts`：`appendLog` 从 if/else 改 switch，加 `query`/`health`/`lint` 三分支 + default 兜底（原 ingest/ingest-failed block 文本完全不变）
- **Task 1.4** `app/packages/server/src/wiki/health.ts`（新建）：`checkHealth()` 三检查——孤儿页（零入链）/ 断链（`[text](xxx.md)` 目标不存在，排除 index.md/log.md/http）/ 空短页（去首行标题后正文 <100 字）

4 个 commit（3e955d7 / 7ed9ab4 / f13dd87 / 3c603e2）。

## 自测结果

**完整 typecheck**（每步都跑）：

```
$ cd app && pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```
全绿（4 次，每个 Task 一次）。

**Spike 验证 health + readIndex/readLog/appendLog**（临时脚本，用 `MA_WORKSPACE_CWD` 指向 `_spike-tmp/` 隔离，测后已删）：

建 3 个测试页（test-a 被引用、test-b 引用 test-a 但自己零入链、test-orphan 零入链且正文短），跑 `checkHealth()`：

```
=== readIndex ===           ← 解析出 3 条 {slug,title} ✓
[{"slug":"test-a","title":"Page A"}, {"slug":"test-orphan",...}, {"slug":"test-b",...}]

=== readLog（5 种 type block 全部正确生成）===
## [2026-07-16] ingest | FRI-01        ← 原格式不变 ✓
- Source: issue/1
- Page: test-a.md
## [2026-07-16] ingest-failed | FRI-02  ← 原格式不变 ✓
## [2026-07-16] query | query          ← 新分支 ✓
- Question stored: test-answer.md
## [2026-07-16] health | 结构检查       ← 新分支 ✓
## [2026-07-16] lint | 语义检查         ← 新分支 ✓

=== checkHealth ===
total: 3 ✓
orphans: ['test-b','test-orphan']  ← test-a 被 test-b 引用所以不在孤儿列 ✓
brokenLinks: []                    ← 无断链 ✓
stubs: [{test-a,86},{test-orphan,3}]  ← <100 字判定正确 ✓
```

**关键验证点：** appendLog 改 switch 后原 ingest/ingest-failed 的 block 文本与 S06 完全一致（回归不破坏）；readIndex 正则 `/^-\s+\[([^\]]+)\]\(([^)]+)\)/gm` 能匹配 appendIndex 写的 `- [标题](slug.md) — xxx` 格式；health 的入链计数/断链/空短三个检查逻辑都符合预期。

## 与计划的偏离

无。完全按计划 Task 1.1-1.5 执行。唯一补充：spike 脚本比计划多验证了 appendLog 的 5 种 type 和 readIndex/readLog（计划只要求验 health），因为正好顺便确认 store 扩展无回归——证据更充分。

## 遗留 / 下一个执行者要注意的点

**给 impl-2（query 管线 + lint 管线 + API 路由）的接口契约：**

1. **store.ts 导出签名**（已就绪，直接 import）：
   - `readIndex(): { slug: string; title: string }[]` — 解析 index.md 的 markdown 链接
   - `readLog(): string` — 读 log.md 全文
   - `readWikiPage(slug): { slug, title, content } | null`（S06 已有，query 要用）
   - `listWikiPages(): { slug, title }[]`（S06 已有，lint 要用）
   - `writeWikiPage(slug, content)` / `appendIndex({slug,title,identifier})` / `appendLog({type,identifier,issueId,slug?,error?})`（S06 已有，存回路由要用）
   - `appendLog` 的 type 现支持：`'ingest' | 'ingest-failed' | 'query' | 'health' | 'lint'`（任意 string 也行，有 default 分支）

2. **shared 契约已 export**（`@ma/shared`）：`WikiQueryResult` / `WikiQueryInput` / `WikiHealthResult` / `WikiLintResult` / `CreateWikiPageInput`。routes/wiki.ts 要 import `WikiQueryInput` + `CreateWikiPageInput` 做请求体校验。

3. **health.ts 已就绪**：`checkHealth()` 同步函数，直接在 `GET /api/wiki/health` 路由里调即可。

4. **appendLog 在路由里的调用约定**（计划 Task 2.3 已定，照抄）：
   - `POST /query` → `appendLog({ type: 'query', identifier: '-', issueId: 'query' })`
   - `GET /health` → `appendLog({ type: 'health', identifier: '-', issueId: '-' })`
   - `POST /lint` → `appendLog({ type: 'lint', identifier: '-', issueId: '-' })`
   - `POST /pages`（存回）→ `appendLog({ type: 'query', identifier: 'query', issueId: 'query', slug })`

5. **readIndex 正则只认 `- [标题](slug.md)` 开头的行**——appendIndex 写的格式正好是 `- [标题](slug.md) — identifier（date）`，正则匹配 `(...)` 内的全部内容再 `.replace(/\.md$/,'')` 去 .md。如果以后改 index.md 格式，readIndex 要同步改。

6. **store.ts 的 `MA_WORKSPACE_CWD` 环境变量**：getWikiDir() 优先用它，否则 fallback cwd。开发时 wiki/ 目录会建在 cwd（项目根）。spike 时我用临时目录隔离，正式 dev 不用管。

7. **不要重复造轮子**：query.ts 需要 `createLlm` + `generateWikiPage(llm, prompt)`，从 `./llm.js` import（S06 已有）；slug 生成用 `generateSlug(identifier, title)` 从 `./slug.js` import（S06 已有）。

## 验收结论（仅计划者填）

> 切片是否达标、能否合并、是否要点亮 FRI-11 路径的某一段。

- [x] typecheck 通过（4 次全绿）— 计划者复核 `pnpm -r typecheck` 确认全绿
- [x] shared 契约完整（5 个 schema + type，schema.ts line 279-314 确认）
- [x] store.ts 扩展正确（readIndex/readLog 新增；appendLog switch 重构，原 ingest/ingest-failed 行为不变）
- [x] health.ts 三检查正确（孤儿页/断链/空短页，代码逐行核对）
- [x] spike 验证充分（readIndex 正则匹配 + appendLog 5 种 type + health 三检查全跑通）
- [ ] `pnpm dev` 端到端（impl-1 未碰路由/前端，由 impl-2 接线后验证）
- [ ] 切片完整验收（impl-1 是数据层，整体验收在 impl-3 端到端）

### 代码审查要点

1. **health.ts 入链计数逻辑**（line 20-35）：扫每页的 `[text](target.md)` 链接，target 在 allSlugs 中则计数+1，不在且非 index/log/http 则记断链。逻辑正确。
2. **health.ts 空短页判断**（line 41-49）：`content.replace(/^#\s+.+$/m, '').trim()` 去首行标题后取长度。正确——与 llm-wiki-agent health.py:52-66 一致。
3. **appendLog switch 回归安全**（store.ts）：原 ingest block 文本 = `` `## [${date}] ingest | ${entry.identifier}\n- Source: issue/${entry.issueId}\n- Page: ${entry.slug}.md\n\n` ``，改 switch 后完全一致（执行者 spike 验证确认）。issues.ts 调用方不受影响。
4. **readIndex 正则**（store.ts）：`/^-\s+\[([^\]]+)\]\(([^)]+)\)/gm` 匹配 appendIndex 写的 `- [标题](slug.md) — xxx`。spike 验证 3 条全解析正确。

- 结论：**impl-1 验收通过**。数据层 + 零 LLM 检查就绪，可进 impl-2（query 管线 + lint 管线 + API 路由）。

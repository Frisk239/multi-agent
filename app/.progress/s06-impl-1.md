# Handoff: s06-impl-1

> 切片：`S06` · 角色：`impl` · 序号：`1`
> 日期：2026-07-16

## 上下文（给下一个会话读）

S06 = Phase 2 第一切片「Wiki 存储 + 浏览器 + ingest 管线」。目标：Issue 完成（status→done）时 LLM 自动生成 wiki 页 → 写文件系统 → WS 推前端 → `/wiki` 浏览器展示。

本会话（impl-1）是三执行者片段的第一个：**数据/工具基础层**（shared 契约 + LangChain 依赖 + store.ts + llm.ts）。无 Fastify 路由、无前端。是 impl-2（管线+API+触发）和 impl-3（前端）的依赖。

读 [design/roadmap.md](../../design/roadmap.md) + [plan](../../docs/superpowers/plans/2026-07-15-s06-wiki.md)「执行者片段 A」+ 本文件。

## 本会话完成了什么

- **Task 1.1：shared 契约扩展**（`app/packages/shared/src/schema.ts`）
  - 新增 `WikiPage`（`{slug, title, content}`）、`WikiPageSummary`（`{slug, title}`）、`WikiPageCreatedEvent`（`{type: 'wiki:page-created', slug, title}`）
  - `DomainEvent` 联合类型加入 `WikiPageCreatedEvent`
- **Task 1.2：安装 LangChain.js 依赖**（`app/packages/server/package.json`）
  - 实际安装版本：`@langchain/openai@^1.5.5` + `@langchain/anthropic@^1.5.1` + `@langchain/core@^1.2.3`
  - import spike 验证：`ChatOpenAI` / `ChatAnthropic` 均可正常 import（打印 `function function`）
- **Task 1.3：Wiki 存储层**（`app/packages/server/src/wiki/store.ts`，新建）
  - `getWikiDir()`：`resolve(MA_WORKSPACE_CWD ?? cwd, 'wiki')`
  - `ensureWikiDir()`：启动时建 `wiki/` + `raw/` + 初始 `index.md` / `log.md`
  - `listWikiPages()`：扫 `*.md`（排除 index/log），title 从首行 `# ` 提取
  - `readWikiPage(slug)`：读 `<slug>.md`
  - `writeWikiPage(slug, content)`：写 `<slug>.md`
  - `appendIndex({slug, title, identifier})`：追加 index 条目（带 .md 链接）
  - `appendLog({type, identifier, issueId, slug?, error?})`：append log（`ingest` / `ingest-failed`）
  - `saveRaw(issueId, content)`：写 `raw/issue-<id>-<timestamp>.md`
  - spike 验证：全部函数跑通（list/read/write/appendIndex/appendLog/saveRaw 都正确产出文件）
- **Task 1.4：LLM 双 provider 工厂**（`app/packages/server/src/wiki/llm.ts`，新建）
  - `createLlm(): BaseChatModel`：按 `WIKI_LLM_PROVIDER` 返回 `ChatOpenAI` 或 `ChatAnthropic`
  - `buildIngestPrompt(issue, sourceText): string`：构建中文 ingest prompt
  - `generateWikiPage(llm, prompt): Promise<string>`：调 LLM，content 兜底 toString

## 自测结果

```
$ pnpm -r typecheck   # 每次 Task 后都跑，最终全绿
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

store.ts spike 验证（临时脚本，已删）：
```
$ npx tsx src/wiki/_spike-store.ts
list: [ { slug: 'test-page', title: 'Test Page' } ]
read: { slug: 'test-page', title: 'Test Page', content: '# Test Page\n\nThis is a test.' }
done
```
spike 产物（wiki/index.md + log.md + test-page.md + raw/ 快照）结构正确，已清理。

## 与计划的偏离

1. **分支基础**：计划说「从 main 切出」，但 S05 尚未合 main（`feat/s05-skill-mcp` 未合并），而 S06 代码依赖 S05 的 schema/路由/前端基础（计划文件结构明确「S05 真实代码（S06 在此之上改）」）。因此 `feat/s06-wiki` 基于 `feat/s05-skill-mcp` 切出，而非 main。合并时需注意 S05 应先合 main，或 S06 PR 基于 S05 分支。
   - 同时删除了旧的 `feat/s06-wiki`（原只到 S04，无 S05 代码，无 remote，安全删除重建）。

2. **LangChain 1.x `ChatOpenAI` baseURL 写法**：计划用顶层 `baseURL: process.env.WIKI_LLM_BASE_URL`，但 LangChain 1.x 的 `ChatOpenAIFields` 没有 `baseURL` 顶层字段——它走 `configuration: { baseURL }`（OpenAI SDK `ClientOptions`）。已修正为：
   ```typescript
   ...(baseURL ? { configuration: { baseURL } } : {}),
   ```
   功能等价，只是字段路径变了。

## 遗留 / 下一个执行者要注意的点

### 给 impl-2（管线 + API + 触发接线）

**store.ts 导出签名**（照搬即可）：
- `getWikiDir(): string`
- `ensureWikiDir(): void`
- `listWikiPages(): { slug: string; title: string }[]`
- `readWikiPage(slug: string): { slug: string; title: string; content: string } | null`
- `writeWikiPage(slug: string, content: string): void`
- `appendIndex(entry: { slug: string; title: string; identifier: string }): void`
- `appendLog(entry: { type: string; identifier: string; issueId: string; slug?: string; error?: string }): void`
- `saveRaw(issueId: string, content: string): void`

**llm.ts 导出签名**：
- `createLlm(): BaseChatModel`（来自 `@langchain/core/language_models/chat_models`）
- `buildIngestPrompt(issue: Issue, sourceText: string): string`（`Issue` 来自 `@ma/shared`）
- `generateWikiPage(llm: BaseChatModel, prompt: string): Promise<string>`

**重要约定**：
- **slug 不含 `.md`**：API 层和 ingest 只打交道不含扩展名的 slug；扩展名在 store.ts 内部拼接。`appendIndex` 的 markdown 链接里带 `.md`（标准 md 链接格式），但那是 index.md 内的展示文本。
- **`wiki/` 目录在 .gitignore 里**（根 `.gitignore` 有 `wiki/` 条目）：运行时生成的 wiki 内容不进 git。开发期如需提交样例，要手动 `-f`。impl-3 端到端验收时注意：`wiki/` 产物是运行时生成的，重启 `pnpm dev` 后 `ensureWikiDir()` 会重建空的 index/log。
- **`getWikiDir()` 依赖 `MA_WORKSPACE_CWD`**：运行时需配此环境变量指向项目根，否则 wiki/ 会生成在 `process.cwd()`（`pnpm dev` 从 `app/` 启动时是 `app/`）。S05 的 `scanSkills` 同此模式。

**WikiPageCreatedEvent 结构**（WS 事件，ingest 完成后 impl-2 的 `eventBus.publish` 要发这个）：
```typescript
{ type: 'wiki:page-created', slug: string, title: string }
```

**BaseChatModel import 路径**：`import type { BaseChatModel } from '@langchain/core/language_models/chat_models'`（不要带 `/dist`，package.json exports 映射已处理）。LangChain 1.x 验证可用。

## 验收结论（仅计划者填）

> 切片是否达标、能否合并、是否要点亮 FRI-11 路径的某一段。

- [x] typecheck 通过（Task 1.1-1.4 每次 + 最终全绿）— 计划者复核 `pnpm -r typecheck` 确认全绿
- [x] shared 契约完整（WikiPage/WikiPageSummary/WikiPageCreatedEvent + DomainEvent 扩展，line 254-311 确认）
- [x] store.ts 8 个导出函数签名与计划一致（getWikiDir/ensureWikiDir/list/read/write/appendIndex/appendLog/saveRaw）
- [x] llm.ts 双 provider 工厂正确（ChatOpenAI + ChatAnthropic，LangChain 1.x baseURL→configuration 偏离合理）
- [x] LangChain 依赖安装（@langchain/openai@^1.5.5 + anthropic@^1.5.1 + core@^1.2.3）
- [ ] `pnpm dev` 能跑（impl-1 无路由/前端改动，由 impl-2 接线后验证）
- [ ] 切片验收标准达成（impl-1 是基础层，完整验收在 impl-3 端到端）

### 偏离评估

1. **分支基础 feat/s05-skill-mcp（非 main）**：合理。S06 依赖 S05 代码（skill scanner 模式、前端基础），S05 未合 main。合并顺序：S05 先合 main → S06 rebase 或直接 PR。计划者合并时处理。
2. **LangChain 1.x ChatOpenAI baseURL → configuration: { baseURL }**：正确修正。LangChain 1.x API 变更，执行者 spike 验证后修正，功能等价。

### 给 impl-2 的补充注意点

1. **`appendLog` 的 `type` 参数是 `string`（非字面量联合）**：ingest.ts 调用时传 `'ingest'` 或 `'ingest-failed'`，store.ts 内部 if 分支匹配这两个值。安全。
2. **`getWikiDir()` 依赖 `MA_WORKSPACE_CWD`**：开发期 `pnpm dev` 从 `app/` 启动，如不配此环境变量，wiki/ 会生成在 `app/wiki/` 而非项目根。impl-2 接线时需确认：要么在启动脚本配 `MA_WORKSPACE_CWD`，要么接受 `app/wiki/` 位置（与 S05 scanner 的 `.skills/` 同理）。建议接受现状（app/ 下），与 S05 一致。
3. **DomainEvent 联合已含 WikiPageCreatedEvent**：ws-broadcaster 和 ws.ts handler 的类型收窄自动覆盖，impl-2/impl-3 无需改 shared。

- 结论：**impl-1 验收通过**。数据/工具基础层就绪，可进 impl-2（ingest 管线 + API + 触发接线）。

# S07 Wiki query + health + lint 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本项目工程模式：** AGENTS.md 规定的"垂直切片 × 计划者-执行者"。计划者把 Task 按自然依赖边界切成执行者片段，每个片段由用户新开的会话执行，靠 `app/.progress/` handoff 串行交接。
> **spec 真源：** [`docs/superpowers/specs/2026-07-16-s07-wiki-query-health-lint-design.md`](../specs/2026-07-16-s07-wiki-query-health-lint-design.md)（自审 12 项验证通过）
> **S06 真实代码（S07 在此之上改）：** 所有 file:line 已核对到 S06 分支（feat/s06-wiki）版本

**Goal:** 在 S06（存储 + ingest + 浏览器）之上补齐知识层的查询 + 维护操作——query（分层检索 + LLM 合成答案 + 引用 + 存回）、health（零 LLM 结构检查）、lint（LLM 语义检查）。

**Architecture:** query 照 llm-wiki-agent 的分层检索（关键词匹配 index + LLM 选页 fallback + 塞 ≤15 页截断 1500 字）；health 零 LLM 扫文件查孤儿/断链/空短；lint 异步 LLM 查矛盾/过期/缺引用。复用 S06 的 store.ts（扩展 readIndex/readLog/appendLog）、llm.ts（createLlm/generateWikiPage）、WikiPageCreatedEvent。

**Tech Stack:** 同 S01-S06（TypeScript / Fastify / Drizzle / better-sqlite3 / Next.js / Zod）+ 复用 S06 的 LangChain.js

## Global Constraints

（来自 spec，所有 Task 隐式遵守）

- **分支：** `feat/s07-query-health-lint`（从 main 切出；**注意 S06 必须先合 main**，或从此 feat/s06-wiki 切出——执行者执行前确认 main 上已有 S06 代码）
- **复用 S06 不重复造：** `createLlm()` / `generateWikiPage(llm, prompt)` / `listWikiPages()` / `readWikiPage(slug)` / `writeWikiPage(slug, content)` / `appendIndex(entry)` / `appendLog(entry)` / `generateSlug(identifier, title)` 全部从 S06 已有代码 import
- **store.ts 扩展而非新建：** readIndex / readLog 新增到 store.ts；appendLog 扩展为 switch 多类型（原 ingest/ingest-failed 行为不变）
- **query 检索分层：** 关键词匹配 index（CJK 双字 gram）→ 命中 ≤1 页时 LLM 选页 fallback → 塞 ≤15 页（每页截断 1500 字）→ LLM 合成答案 + 引用
- **health 零 LLM：** 孤儿页（零入链）/ 断链（`[text](xxx.md)` 目标不存在）/ 空短页（正文 <100 字）。瞬时返回
- **lint 异步 LLM：** 读 ≤20 页（截断 1500 字）→ LLM 查矛盾/过期/缺交叉引用/需深化
- **query 存回：** slug 用 `query-` 前缀（区别于 `FRI-XX-`）；appendLog type='ingest' identifier='query' issueId='query'
- **不新增 WS 事件：** 存回复用 S06 的 WikiPageCreatedEvent
- **Git：** feature 分支，Conventional Commits，绝不 push main
- **不引入测试框架：** 用 `pnpm typecheck` + 手动 `pnpm dev` 验证（与既有切片一致）

## 文件结构（S07 改动决策）

```
app/packages/
├── shared/src/schema.ts              [改] 加 WikiQueryResult/Input + WikiHealthResult + WikiLintResult + CreateWikiPageInput
├── server/src/
│   ├── wiki/
│   │   ├── store.ts                  [改] 扩展：加 readIndex() + readLog()；appendLog 改 switch 多类型
│   │   ├── query.ts                  [新] query 管线：queryWiki + keywordMatch + llmSelectPages + buildQueryPrompt
│   │   ├── health.ts                 [新] health 检查：checkHealth（孤儿/断链/空短）
│   │   └── lint.ts                   [新] lint 检查：checkLint（LLM 语义）
│   └── routes/
│       └── wiki.ts                   [改] 加 POST /query + GET /health + POST /lint + POST /pages（存回）
├── web/
│   ├── components/
│   │   ├── WikiPage.tsx              [改] 加"问答"按钮 + health/lint 面板入口
│   │   ├── WikiQueryDialog.tsx       [新] query 对话框（modal + 答案渲染 + 引用 + 存回）
│   │   └── WikiHealthPanel.tsx       [新] health + lint 结果面板（表格 + 状态 pill）
│   └── lib/api.ts                    [改] 加 useWikiQuery + useWikiHealth + useWikiLint + useCreateWikiPage hooks
```

---

# 执行者片段 A（impl-1）：shared 契约 + store 扩展 + health

> **参考边界：** 数据层 + 零 LLM 检查。无 Fastify 路由、无前端。是 query/lint/API 的依赖。
> **会话边界：** 开新会话，读 AGENTS.md + spec §4/§5.1 + 本 Task 组。同一分支。完成后写 `app/.progress/s07-impl-1.md`。

### Task 1.1: shared 契约扩展

**Files:** Modify `app/packages/shared/src/schema.ts`

**必读：** spec §5.1（WikiQueryResult/Input + WikiHealthResult + WikiLintResult + CreateWikiPageInput）

**Interfaces:**
- Produces: `WikiQueryResult`、`WikiQueryInput`、`WikiHealthResult`、`WikiLintResult`、`CreateWikiPageInput`

- [ ] **Step 1: 在 schema.ts 中 S06 WikiPageCreatedEvent 之后加 S07 契约**

找到 `WikiPageCreatedEvent` 定义块之后（约 line 274 附近），在 `DomainEvent` 联合类型定义之前，插入：

```typescript
// —— S07：Wiki query / health / lint 契约 ——

// query 结果（spec §5.1）
export const WikiQueryResult = z.object({
  answer: z.string(),
  citations: z.array(z.object({
    slug: z.string(),
    title: z.string(),
  })),
});
export type WikiQueryResult = z.infer<typeof WikiQueryResult>;

export const WikiQueryInput = z.object({
  question: z.string().min(1),
});
export type WikiQueryInput = z.infer<typeof WikiQueryInput>;

// health 结构检查结果（spec §5.1）
export const WikiHealthResult = z.object({
  orphans: z.array(z.object({ slug: z.string(), title: z.string() })),
  brokenLinks: z.array(z.object({ from: z.string(), to: z.string() })),
  stubs: z.array(z.object({ slug: z.string(), title: z.string(), bodyChars: z.number() })),
  total: z.number(),
});
export type WikiHealthResult = z.infer<typeof WikiHealthResult>;

// lint 语义检查结果（spec §5.1）
export const WikiLintResult = z.object({
  report: z.string(),
  checkedPages: z.array(z.object({ slug: z.string(), title: z.string() })),
});
export type WikiLintResult = z.infer<typeof WikiLintResult>;

// 存回 wiki 页输入（spec §5.1）
export const CreateWikiPageInput = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});
export type CreateWikiPageInput = z.infer<typeof CreateWikiPageInput>;
```

- [ ] **Step 2: typecheck 验证**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add app/packages/shared/src/schema.ts
git commit -m "feat(s07): shared 契约（WikiQueryResult/Input + WikiHealthResult + WikiLintResult + CreateWikiPageInput）"
```

---

### Task 1.2: store.ts 扩展——readIndex + readLog

**Files:** Modify `app/packages/server/src/wiki/store.ts`

**必读：** spec §4.3（readIndex/readLog 签名）+ S06 store.ts 现有代码（appendIndex 写的 index.md 格式 = `- [标题](slug.md) — identifier（date）`）

**Interfaces:**
- Produces:
  - `readIndex(): { slug: string; title: string }[]` — 解析 index.md 的 markdown 链接
  - `readLog(): string` — 读 log.md 全文

- [ ] **Step 1: store.ts 加 readIndex**

在 `app/packages/server/src/wiki/store.ts` 中，找到 `saveRaw` 函数之后（文件末尾），加：

```typescript
// S07：读 index.md，解析为 [{slug, title}]（spec §4.3）
// index.md 格式（appendIndex 写入）：- [标题](slug.md) — identifier（date）
export function readIndex(): { slug: string; title: string }[] {
  const indexPath = join(getWikiDir(), 'index.md');
  if (!existsSync(indexPath)) return [];
  const content = readFileSync(indexPath, 'utf-8');
  const entries: { slug: string; title: string }[] = [];
  const re = /^-\s+\[([^\]]+)\]\(([^)]+)\)/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    const title = match[1];
    const slug = match[2].replace(/\.md$/, '');
    entries.push({ slug, title });
  }
  return entries;
}

// S07：读 log.md 全文（spec §4.3）
export function readLog(): string {
  const logPath = join(getWikiDir(), 'log.md');
  if (!existsSync(logPath)) return '';
  return readFileSync(logPath, 'utf-8');
}
```

- [ ] **Step 2: typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add app/packages/server/src/wiki/store.ts
git commit -m "feat(s07): store.ts 加 readIndex + readLog"
```

---

### Task 1.3: store.ts 扩展——appendLog 改 switch 多类型

**Files:** Modify `app/packages/server/src/wiki/store.ts`

**必读：** spec §4.3（appendLog 扩展为 switch）+ S06 store.ts 现有 appendLog（if/else 两分支）

**Interfaces:**
- Produces: appendLog 签名不变（`{type, identifier, issueId, slug?, error?}`），内部从 if/else 改 switch

- [ ] **Step 1: 替换 appendLog 的 if/else 为 switch**

在 `app/packages/server/src/wiki/store.ts` 中，找到 `appendLog` 函数（约 line 85-105），将其中的 if/else 块替换为 switch：

将这段（现有代码）：
```typescript
  let block: string;
  if (entry.type === 'ingest') {
    block = `## [${date}] ingest | ${entry.identifier}\n- Source: issue/${entry.issueId}\n- Page: ${entry.slug}.md\n\n`;
  } else {
    // ingest-failed
    block = `## [${date}] ingest-failed | ${entry.identifier}\n- Source: issue/${entry.issueId}\n- Error: ${entry.error ?? 'unknown'}\n\n`;
  }
```

替换为：
```typescript
  let block: string;
  switch (entry.type) {
    case 'ingest':
      block = `## [${date}] ingest | ${entry.identifier}\n- Source: issue/${entry.issueId}\n- Page: ${entry.slug}.md\n\n`;
      break;
    case 'ingest-failed':
      block = `## [${date}] ingest-failed | ${entry.identifier}\n- Source: issue/${entry.issueId}\n- Error: ${entry.error ?? 'unknown'}\n\n`;
      break;
    case 'query':
      block = `## [${date}] query | ${entry.identifier}\n- Question stored: ${entry.slug}.md\n\n`;
      break;
    case 'health':
      block = `## [${date}] health | 结构检查\n\n`;
      break;
    case 'lint':
      block = `## [${date}] lint | 语义检查\n\n`;
      break;
    default:
      block = `## [${date}] ${entry.type} | ${entry.identifier}\n\n`;
  }
```

同时更新 type 注释：
```typescript
  type: string; // 'ingest' | 'ingest-failed' | 'query' | 'health' | 'lint'
```

- [ ] **Step 2: typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿（原 ingest/ingest-failed 行为不变，只是重构分支结构）

- [ ] **Step 3: Commit**

```bash
git add app/packages/server/src/wiki/store.ts
git commit -m "refactor(s07): appendLog 改 switch 多类型（加 query/health/lint 分支，原 ingest 不变）"
```

---

### Task 1.4: health 检查（health.ts）

**Files:** Create `app/packages/server/src/wiki/health.ts`

**必读：** spec §4.1（孤儿页/断链/空短页三检查）

**Interfaces:**
- Consumes: `listWikiPages()` + `readWikiPage(slug)` from store.ts（S06 已有）
- Produces: `checkHealth(): WikiHealthResult`

- [ ] **Step 1: 创建 health.ts**

Create `app/packages/server/src/wiki/health.ts`:

```typescript
// S07 health 结构检查（零 LLM，spec §4.1）
// 照 llm-wiki-agent health.py：孤儿页（零入链）/ 断链 / 空短页（正文 <100 字）
import { listWikiPages, readWikiPage } from './store.js';

export function checkHealth(): {
  orphans: { slug: string; title: string }[];
  brokenLinks: { from: string; to: string }[];
  stubs: { slug: string; title: string; bodyChars: number }[];
  total: number;
} {
  const pages = listWikiPages();
  const allSlugs = new Set(pages.map((p) => p.slug));
  const inboundCount = new Map<string, number>();
  const brokenLinks: { from: string; to: string }[] = [];

  // 初始化入链计数
  for (const p of pages) inboundCount.set(p.slug, 0);

  // 扫每页的 markdown 链接 [text](target.md)
  for (const p of pages) {
    const page = readWikiPage(p.slug);
    if (!page) continue;
    const links = page.content.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
    for (const link of links) {
      const targetSlug = link[2].replace(/\.md$/, '');
      if (allSlugs.has(targetSlug)) {
        inboundCount.set(targetSlug, (inboundCount.get(targetSlug) ?? 0) + 1);
      } else {
        // 排除 index.md / log.md / http 链接
        if (link[2] !== 'index.md' && link[2] !== 'log.md' && !link[2].startsWith('http')) {
          brokenLinks.push({ from: p.slug, to: link[2] });
        }
      }
    }
  }

  // 孤儿页 = 零入链
  const orphans = pages.filter((p) => (inboundCount.get(p.slug) ?? 0) === 0);

  // 空/短页 = 正文 <100 字（去掉首行标题后的内容）
  const stubs = pages
    .map((p) => {
      const page = readWikiPage(p.slug);
      if (!page) return null;
      const body = page.content.replace(/^#\s+.+$/m, '').trim();
      return { slug: p.slug, title: p.title, bodyChars: body.length };
    })
    .filter((p): p is { slug: string; title: string; bodyChars: number } => p !== null)
    .filter((p) => p.bodyChars < 100);

  return { orphans, brokenLinks, stubs, total: pages.length };
}
```

- [ ] **Step 2: typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add app/packages/server/src/wiki/health.ts
git commit -m "feat(s07): health 结构检查（孤儿页/断链/空短页，零 LLM）"
```

---

### Task 1.5: impl-1 自测 + handoff

**必读：** AGENTS.md §工程模式（handoff 规则）

- [ ] **Step 1: 完整 typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 2: 手动 spike 验证 health**

创建临时文件 `app/packages/server/src/wiki/_spike-health.ts`：

```typescript
import { ensureWikiDir, writeWikiPage, appendIndex } from './store.js';
import { checkHealth } from './health.js';

ensureWikiDir();
// 建几个测试页
writeWikiPage('test-a', '# Page A\n\n这是一段足够长的内容，用于测试空短页检查。这里需要超过一百个字符才能不被判定为空短页。'.repeat(2));
writeWikiPage('test-orphan', '# Orphan Page\n\n'.repeat(20));
writeWikiPage('test-b', '# Page B\n\n参见 [Page A](test-a.md) 了解更多。'.repeat(20));
appendIndex({ slug: 'test-a', title: 'Page A', identifier: 'FRI-01' });
appendIndex({ slug: 'test-orphan', title: 'Orphan Page', identifier: 'FRI-02' });
appendIndex({ slug: 'test-b', title: 'Page B', identifier: 'FRI-03' });

const result = checkHealth();
console.log('total:', result.total);
console.log('orphans:', result.orphans.map((o) => o.slug));
console.log('brokenLinks:', result.brokenLinks);
console.log('stubs:', result.stubs.map((s) => ({ slug: s.slug, chars: s.bodyChars })));
```

Run: `cd app/packages/server && npx tsx src/wiki/_spike-health.ts`
Expected: total=3, orphans 含 test-orphan（零入链）和 test-b（test-a 被 test-b 引用但 test-b 无人引用），test-a 不在 orphans（被 test-b 引用）。brokenLinks 应为空。stubs 含 test-orphan（正文短）。

- [ ] **Step 3: 清理 spike + 测试产物**

```bash
rm app/packages/server/src/wiki/_spike-health.ts
rm -rf wiki/
```

- [ ] **Step 4: 写 handoff**

写 `app/.progress/s07-impl-1.md`（照 `_TEMPLATE.md`），必须包含：
- 完成了什么（shared 契约 + store readIndex/readLog + appendLog switch 扩展 + health.ts）
- health spike 验证结果
- store.ts 的 readIndex/readLog/appendLog 导出签名（给 impl-2）
- 给 impl-2 的注意点

- [ ] **Step 5: Commit + push**

```bash
git add app/.progress/s07-impl-1.md
git commit -m "docs(s07): impl-1 handoff（shared 契约 + store 扩展 + health）"
git push origin feat/s07-query-health-lint
```

---

# 执行者片段 B（impl-2）：query 管线 + lint 管线 + API 路由

> **参考边界：** 服务端 LLM 管线层 + 全部 API 路由。在 impl-1 的 store 扩展 + shared 契约之上接线。
> **会话边界：** 开新会话，读 AGENTS.md + spec §3/§4.2/§5.2 + impl-1 handoff + 本 Task 组。同一分支。完成后写 `app/.progress/s07-impl-2.md`。
> **依赖：** impl-1 的 store.ts（readIndex/readLog/appendLog）+ shared 契约 + S06 的 llm.ts（createLlm/generateWikiPage）+ slug.ts（generateSlug）

### Task 2.1: query 管线（query.ts）

**Files:** Create `app/packages/server/src/wiki/query.ts`

**必读：** spec §3.1-3.5（检索分层 + query 函数 + 关键词匹配 + LLM 选页 + prompt）+ impl-1 handoff（readIndex 签名）

**Interfaces:**
- Consumes: `readIndex()` from store.ts、`readWikiPage(slug)` from store.ts、`createLlm()` + `generateWikiPage(llm, prompt)` from llm.ts
- Produces: `queryWiki(question: string): Promise<{ answer: string; citations: { slug: string; title: string }[] }>`

- [ ] **Step 1: 创建 query.ts**

Create `app/packages/server/src/wiki/query.ts`:

```typescript
// S07 query 管线（spec §3）
// 分层检索（照 llm-wiki-agent query.py）：
// Step 1: 关键词匹配 index.md（CJK 感知）→ 候选页
// Step 2: 命中 ≤1 页时 LLM 选页 fallback（单次 JSON）
// Step 3: 塞 ≤15 页（每页截断 1500 字）
// Step 4: LLM 合成答案 + 引用
import { readIndex, readWikiPage } from './store.js';
import { createLlm, generateWikiPage } from './llm.js';

const MAX_PAGES = 15;             // cap（照 llm-wiki-agent query.py:81）
const MAX_CHARS_PER_PAGE = 1500;  // 截断（照 lint.py:289）

// 关键词匹配（CJK 双字 gram，照 llm-wiki-agent query.py:30-55）
function titleMatchesQuestion(title: string, question: string): boolean {
  // ASCII 词：空格分词，长度 ≥2
  const asciiWords = title.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w) && w.length >= 2);
  if (asciiWords.some((w) => question.toLowerCase().includes(w.toLowerCase()))) return true;
  // CJK 双字 gram
  const cjkChars = title.match(/[\u4e00-\u9fff]/g) ?? [];
  for (let i = 0; i < cjkChars.length - 1; i++) {
    const gram = cjkChars[i] + cjkChars[i + 1];
    if (question.includes(gram)) return true;
  }
  return false;
}

function keywordMatch(
  entries: { slug: string; title: string }[],
  question: string,
): { slug: string; title: string }[] {
  return entries.filter((e) => titleMatchesQuestion(e.title, question));
}

// LLM 选页 fallback（spec §3.4）
async function llmSelectPages(
  entries: { slug: string; title: string }[],
  question: string,
): Promise<{ slug: string; title: string }[]> {
  const llm = createLlm();
  const indexText = entries.map((e) => `- ${e.title} (slug: ${e.slug})`).join('\n');
  const prompt = `以下是 wiki 的页面索引：

${indexText}

用户问题：${question}

哪些页面最相关？只返回一个 JSON 数组，元素是 slug 字符串。不要输出其他内容。
示例：["fri-11-xxx", "fri-04-yyy"]`;

  const raw = await generateWikiPage(llm, prompt);
  try {
    const slugs = JSON.parse(raw) as string[];
    return entries.filter((e) => slugs.includes(e.slug));
  } catch {
    return [];
  }
}

// query prompt（spec §3.5）
function buildQueryPrompt(
  question: string,
  context: string,
  pages: { slug: string; title: string }[],
): string {
  const pageList = pages.map((p) => `- ${p.title}`).join('\n');
  return `你是项目 Wiki 的知识助手。基于以下 Wiki 页面内容回答用户问题。
回答时请引用来源页面（用"（见：页面标题）"标注）。
如果信息不足，如实说明。

可用页面：
${pageList}

页面内容：
${context}

用户问题：${question}`;
}

// 完整 query 管线（spec §3.2）
export async function queryWiki(question: string): Promise<{
  answer: string;
  citations: { slug: string; title: string }[];
}> {
  // Step 1: 关键词匹配 index
  const indexEntries = readIndex();
  let candidates = keywordMatch(indexEntries, question);

  // Step 2: LLM 选页 fallback（≤1 页命中时）
  if (candidates.length <= 1) {
    candidates = await llmSelectPages(indexEntries, question);
  }

  // Step 3: 塞 ≤15 页
  const pages = candidates
    .slice(0, MAX_PAGES)
    .map((slug) => readWikiPage(slug))
    .filter((p): p is { slug: string; title: string; content: string } => p !== null);

  if (pages.length === 0) {
    return { answer: 'Wiki 中没有找到相关页面。', citations: [] };
  }

  const context = pages
    .map((p) => `--- ${p.title} (${p.slug}) ---\n${p.content.slice(0, MAX_CHARS_PER_PAGE)}`)
    .join('\n\n');

  // Step 4: LLM 合成
  const llm = createLlm();
  const prompt = buildQueryPrompt(question, context, pages);
  const answer = await generateWikiPage(llm, prompt);

  return {
    answer,
    citations: pages.map((p) => ({ slug: p.slug, title: p.title })),
  };
}
```

- [ ] **Step 2: typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add app/packages/server/src/wiki/query.ts
git commit -m "feat(s07): query 管线（分层检索 keywordMatch + llmSelectPages + 合成答案 + 引用）"
```

---

### Task 2.2: lint 管线（lint.ts）

**Files:** Create `app/packages/server/src/wiki/lint.ts`

**必读：** spec §4.2（lint LLM 语义检查）

**Interfaces:**
- Consumes: `listWikiPages()` + `readWikiPage(slug)` from store.ts、`createLlm()` + `generateWikiPage(llm, prompt)` from llm.ts
- Produces: `checkLint(): Promise<{ report: string; checkedPages: { slug: string; title: string }[] }>`

- [ ] **Step 1: 创建 lint.ts**

Create `app/packages/server/src/wiki/lint.ts`:

```typescript
// S07 lint 语义检查（LLM，spec §4.2）
// 照 llm-wiki-agent lint.py:280-298：读 ≤20 页（截断 1500 字）→ LLM 查矛盾/过期/缺引用/需深化
import { listWikiPages, readWikiPage } from './store.js';
import { createLlm, generateWikiPage } from './llm.js';

const MAX_LINT_PAGES = 20;
const MAX_LINT_CHARS = 1500;

export async function checkLint(): Promise<{
  report: string;
  checkedPages: { slug: string; title: string }[];
}> {
  const allPages = listWikiPages();
  const pages = allPages.slice(0, MAX_LINT_PAGES);

  if (pages.length === 0) {
    return { report: 'Wiki 中没有页面可供检查。', checkedPages: [] };
  }

  const context = pages
    .map((p) => {
      const page = readWikiPage(p.slug);
      if (!page) return null;
      return `--- ${p.title} (${p.slug}) ---\n${page.content.slice(0, MAX_LINT_CHARS)}`;
    })
    .filter((c): c is string => c !== null)
    .join('\n\n');

  const llm = createLlm();
  const prompt = `你是 Wiki 质量审查员。以下是 ${pages.length} 个 Wiki 页面。请检查并报告：

1. 矛盾：不同页面间的信息冲突
2. 过期声明：已被更新内容取代的旧描述
3. 缺失交叉引用：相关页面之间应该互链但没有
4. 需深化的概念：被多次提及但内容过于简略

页面内容：
${context}

请输出 markdown 报告，每类问题用 ## 标题分段。如无问题，说明"未发现明显问题"。`;

  const report = await generateWikiPage(llm, prompt);
  return { report, checkedPages: pages };
}
```

- [ ] **Step 2: typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add app/packages/server/src/wiki/lint.ts
git commit -m "feat(s07): lint 语义检查（≤20 页截断 1500 字 → LLM 查矛盾/过期/缺引用/需深化）"
```

---

### Task 2.3: Wiki API 路由扩展（wiki.ts）

**Files:** Modify `app/packages/server/src/routes/wiki.ts`

**必读：** spec §5.2（API 总览：POST /query + GET /health + POST /lint + POST /pages）+ S06 wiki.ts 现有代码

**Interfaces:**
- Consumes: `queryWiki()` from query.ts、`checkHealth()` from health.ts、`checkLint()` from lint.ts、`writeWikiPage` + `appendIndex` + `appendLog` from store.ts、`generateSlug` from slug.ts、`eventBus` from event-bus.ts
- Produces: 4 个新 API 端点

- [ ] **Step 1: wiki.ts 加 import**

在 `app/packages/server/src/routes/wiki.ts` 顶部，现有 import 之后加：

```typescript
import { WikiQueryInput, CreateWikiPageInput } from '@ma/shared';
import { writeWikiPage, appendIndex, appendLog } from '../wiki/store.js';
import { generateSlug } from '../wiki/slug.js';
import { queryWiki } from '../wiki/query.js';
import { checkHealth } from '../wiki/health.js';
import { checkLint } from '../wiki/lint.js';
import { eventBus } from '../orchestration/event-bus.js';
```

- [ ] **Step 2: 加 POST /api/wiki/query**

在 `wikiRoutes` 函数内，现有 GET 路由之后加：

```typescript
  // POST /api/wiki/query — 问答（spec §5.2）
  app.post('/api/wiki/query', async (req, reply) => {
    const parsed = WikiQueryInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const result = await queryWiki(parsed.data.question);
    appendLog({ type: 'query', identifier: '-', issueId: 'query' });
    return result;
  });
```

- [ ] **Step 3: 加 GET /api/wiki/health**

```typescript
  // GET /api/wiki/health — 结构检查（零 LLM，瞬时，spec §5.2）
  app.get('/api/wiki/health', async () => {
    const result = checkHealth();
    appendLog({ type: 'health', identifier: '-', issueId: '-' });
    return result;
  });
```

- [ ] **Step 4: 加 POST /api/wiki/lint**

```typescript
  // POST /api/wiki/lint — 语义检查（LLM，异步，spec §5.2）
  app.post('/api/wiki/lint', async () => {
    const result = await checkLint();
    appendLog({ type: 'lint', identifier: '-', issueId: '-' });
    return result;
  });
```

- [ ] **Step 5: 加 POST /api/wiki/pages（存回）**

```typescript
  // POST /api/wiki/pages — 存回 wiki 页（spec §3.6/§5.2）
  app.post('/api/wiki/pages', async (req, reply) => {
    const parsed = CreateWikiPageInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { title, content } = parsed.data;
    const slug = generateSlug('query', title);
    writeWikiPage(slug, content);
    appendIndex({ slug, title, identifier: 'query' });
    appendLog({ type: 'query', identifier: 'query', issueId: 'query', slug });
    eventBus.publish({ type: 'wiki:page-created', slug, title });
    return reply.status(201).send({ slug, title });
  });
```

- [ ] **Step 6: typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 7: 启动验证 + curl 测试**

Run: `cd app && pnpm dev`

手动 curl 测试（开另一个终端）：
```bash
# health（零 LLM，瞬时）
curl http://localhost:3001/api/wiki/health
# 预期：{"orphans":[],"brokenLinks":[],"stubs":[],"total":0}（空 wiki）

# query（无 key 会报错——验证错误处理）
curl -X POST http://localhost:3001/api/wiki/query -H 'Content-Type: application/json' -d '{"question":"test"}'
# 预期：500 或错误（无 WIKI_LLM_API_KEY），但不崩溃

# 存回
curl -X POST http://localhost:3001/api/wiki/pages -H 'Content-Type: application/json' -d '{"title":"测试页","content":"# 测试页\n\n这是存回测试。"}'
# 预期：{"slug":"query-测试页","title":"测试页"}
```

- [ ] **Step 8: Commit**

```bash
git add app/packages/server/src/routes/wiki.ts
git commit -m "feat(s07): Wiki API 路由（POST /query + GET /health + POST /lint + POST /pages 存回）"
```

---

### Task 2.4: impl-2 自测 + handoff

- [ ] **Step 1: 完整 typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 2: 写 handoff**

写 `app/.progress/s07-impl-2.md`，必须包含：
- 完成了什么（query.ts + lint.ts + wiki.ts 4 个新端点）
- curl 测试结果（health 空返回 / 存回成功 / query 无 key 报错但不崩）
- API 端点路径 + 请求/响应格式（给 impl-3）
- query.ts/lint.ts/health.ts 导出签名
- 给 impl-3 的注意点

- [ ] **Step 3: Commit + push**

```bash
git add app/.progress/s07-impl-2.md
git commit -m "docs(s07): impl-2 handoff（query + lint 管线 + API 路由）"
git push origin feat/s07-query-health-lint
```

---

# 执行者片段 C（impl-3）：前端 query 对话框 + health/lint 面板 + 端到端验收

> **参考边界：** 纯前端。query 对话框 + health/lint 面板 + 端到端验收。
> **会话边界：** 开新会话，读 AGENTS.md + spec §5.3-5.5/§6 + impl-2 handoff + 本 Task 组。同一分支。完成后写 `app/.progress/s07-impl-3.md`。
> **依赖：** impl-2 的 API（POST /query + GET /health + POST /lint + POST /pages）+ S06 的 WikiPage 组件 + MarkdownBody + api.ts

### Task 3.1: api.ts 加 S07 hooks

**Files:** Modify `app/packages/web/lib/api.ts`

**必读：** spec §5.5（useWikiQuery + useWikiHealth + useWikiLint + useCreateWikiPage）+ impl-2 handoff（API 路径确认）

**Interfaces:**
- Consumes: `WikiQueryResult` / `WikiHealthResult` / `WikiLintResult` / `CreateWikiPageInput` from `@ma/shared`
- Produces: 4 个新 hooks

- [ ] **Step 1: api.ts 加 import**

在 `app/packages/web/lib/api.ts` 的 type import 块中（已有 `WikiPage, WikiPageSummary`），追加：

```typescript
  WikiQueryResult,
  WikiHealthResult,
  WikiLintResult,
  CreateWikiPageInput,
```

- [ ] **Step 2: api.ts 末尾加 4 个 hooks**

```typescript
// —— S07 Wiki query / health / lint / 存回 hooks ——

// POST /api/wiki/query — 问答（spec §5.5）
export function useWikiQuery() {
  return useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch(`${API}/wiki/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error('查询失败');
      return res.json() as Promise<WikiQueryResult>;
    },
  });
}

// GET /api/wiki/health — 结构检查（手动触发，spec §5.5）
export function useWikiHealth() {
  return useQuery<WikiHealthResult>({
    queryKey: ['wiki-health'],
    queryFn: async () => {
      const res = await fetch(`${API}/wiki/health`);
      if (!res.ok) throw new Error('检查失败');
      return res.json();
    },
    enabled: false, // 手动触发（refetch manually）
  });
}

// POST /api/wiki/lint — 语义检查（spec §5.5）
export function useWikiLint() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/wiki/lint`, { method: 'POST' });
      if (!res.ok) throw new Error('语义检查失败');
      return res.json() as Promise<WikiLintResult>;
    },
  });
}

// POST /api/wiki/pages — 存回 wiki 页（spec §5.5）
export function useCreateWikiPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWikiPageInput) => {
      const res = await fetch(`${API}/wiki/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('保存失败');
      return res.json() as Promise<{ slug: string; title: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki-pages'] });
    },
  });
}
```

- [ ] **Step 3: typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 4: Commit**

```bash
git add app/packages/web/lib/api.ts
git commit -m "feat(s07): useWikiQuery + useWikiHealth + useWikiLint + useCreateWikiPage hooks"
```

---

### Task 3.2: WikiQueryDialog 组件

**Files:** Create `app/packages/web/components/WikiQueryDialog.tsx`

**必读：** spec §5.3（query 对话框 UI）+ MarkdownBody 组件（复用）

**Interfaces:**
- Consumes: `useWikiQuery()` + `useCreateWikiPage()` from api.ts、`MarkdownBody`

- [ ] **Step 1: 创建 WikiQueryDialog.tsx**

Create `app/packages/web/components/WikiQueryDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useWikiQuery, useCreateWikiPage } from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';

// S07 query 对话框（spec §5.3）
// 弹出 modal：输入问题 → LLM 合成答案 + 引用 → 可"存为 wiki 页"
export function WikiQueryDialog({ onClose }: { onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<{ answer: string; citations: { slug: string; title: string }[] } | null>(null);
  const query = useWikiQuery();
  const createPage = useCreateWikiPage();

  function handleSubmit() {
    if (!question.trim()) return;
    query.mutate(question, {
      onSuccess: (data) => setResult(data),
    });
  }

  function handleSave() {
    if (!result) return;
    // 从答案 markdown 提取标题（首行 # ）
    const titleMatch = result.answer.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `问答结果 ${new Date().toLocaleString('zh-CN')}`;
    createPage.mutate(
      { title, content: result.answer },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Wiki 问答</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="wiki-query-input-row">
            <input
              type="text"
              className="wiki-query-input"
              placeholder="输入你的问题..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={query.isPending}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={query.isPending || !question.trim()}
            >
              {query.isPending ? '查询中…' : '提问'}
            </button>
          </div>

          {query.isError && (
            <div className="wiki-query-error">
              查询失败：{query.error.message}（检查 WIKI_LLM_API_KEY 是否配置）
            </div>
          )}

          {result && (
            <div className="wiki-query-result">
              <div className="wiki-query-answer">
                <MarkdownBody source={result.answer} />
              </div>
              {result.citations.length > 0 && (
                <div className="wiki-query-citations">
                  <strong>引用来源：</strong>
                  {result.citations.map((c) => (
                    <span key={c.slug} className="citation-tag">{c.title}</span>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSave}
                disabled={createPage.isPending}
              >
                {createPage.isPending ? '保存中…' : '存为 wiki 页'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/packages/web/components/WikiQueryDialog.tsx
git commit -m "feat(s07): WikiQueryDialog 组件（modal + 答案渲染 + 引用 + 存回）"
```

---

### Task 3.3: WikiHealthPanel 组件

**Files:** Create `app/packages/web/components/WikiHealthPanel.tsx`

**必读：** spec §5.4（health/lint 面板：表格 + 状态 pill）+ MarkdownBody（lint 报告渲染）

**Interfaces:**
- Consumes: `useWikiHealth()` + `useWikiLint()` from api.ts、`MarkdownBody`

- [ ] **Step 1: 创建 WikiHealthPanel.tsx**

Create `app/packages/web/components/WikiHealthPanel.tsx`:

```tsx
'use client';
import { useWikiHealth, useWikiLint } from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';

// S07 health + lint 面板（spec §5.4）
// 结构检查（零 LLM，瞬时）+ 语义检查（LLM，异步）
export function WikiHealthPanel() {
  const health = useWikiHealth();
  const lint = useWikiLint();

  return (
    <div className="wiki-health-panel">
      <div className="wiki-health-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
        >
          {health.isFetching ? '检查中…' : '结构检查'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => lint.mutate()}
          disabled={lint.isPending}
        >
          {lint.isPending ? '语义检查中…' : '语义检查'}
        </button>
      </div>

      {/* 结构检查结果 */}
      {health.data && (
        <div className="wiki-health-result">
          <div className="wiki-health-summary">
            总页数: {health.data.total} ·
            孤儿: {health.data.orphans.length} ·
            断链: {health.data.brokenLinks.length} ·
            空短: {health.data.stubs.length}
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>页面</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {health.data.orphans.map((o) => (
                <tr key={`orphan-${o.slug}`}>
                  <td><span className="health-pill health-pill-red">🔴 孤儿</span></td>
                  <td>{o.title}</td>
                  <td className="text-dim">0 入链</td>
                </tr>
              ))}
              {health.data.brokenLinks.map((b, i) => (
                <tr key={`broken-${i}`}>
                  <td><span className="health-pill health-pill-red">🔴 断链</span></td>
                  <td>{b.from}</td>
                  <td className="text-dim">→ {b.to}（不存在）</td>
                </tr>
              ))}
              {health.data.stubs.map((s) => (
                <tr key={`stub-${s.slug}`}>
                  <td><span className="health-pill health-pill-yellow">🟡 空短</span></td>
                  <td>{s.title}</td>
                  <td className="text-dim">{s.bodyChars} 字</td>
                </tr>
              ))}
              {health.data.orphans.length === 0 &&
                health.data.brokenLinks.length === 0 &&
                health.data.stubs.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-dim" style={{ textAlign: 'center' }}>
                    <span className="health-pill health-pill-green">✅ 全部健康</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 语义检查报告 */}
      {lint.data && (
        <div className="wiki-lint-result">
          <div className="wiki-lint-header">语义检查报告（检查了 {lint.data.checkedPages.length} 页）</div>
          <MarkdownBody source={lint.data.report} />
        </div>
      )}
      {lint.isError && (
        <div className="wiki-query-error">
          语义检查失败：{lint.error.message}（检查 WIKI_LLM_API_KEY 是否配置）
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/packages/web/components/WikiHealthPanel.tsx
git commit -m "feat(s07): WikiHealthPanel 组件（结构检查表格 + 状态 pill + 语义检查报告）"
```

---

### Task 3.4: WikiPage 组件集成

**Files:** Modify `app/packages/web/components/WikiPage.tsx`

**必读：** S06 WikiPage.tsx 现有代码（左列表右渲染）+ spec §5.3-5.4（加"问答"按钮 + health/lint 面板）

- [ ] **Step 1: WikiPage.tsx 加 import + state + 集成**

修改 `app/packages/web/components/WikiPage.tsx`，在现有 import 之后加：

```typescript
import { WikiQueryDialog } from './WikiQueryDialog';
import { WikiHealthPanel } from './WikiHealthPanel';
```

在组件函数内，现有 `useState` 之后加：

```typescript
  const [showQueryDialog, setShowQueryDialog] = useState(false);
```

在 `page-header` 的 `<div className="page-actions">`（或 `<div>` 内 page-desc 之后）加"问答"按钮。找到现有的 `</div>` 结束 `page-header` 内部信息块的位置，在 `page-header` 的右侧 actions 区加：

```tsx
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowQueryDialog(true)}
          >
            问答
          </button>
        </div>
```

在 `wiki-layout` 之前（page-header 之后），加 health/lint 面板：

```tsx
      <WikiHealthPanel />

      {showQueryDialog && <WikiQueryDialog onClose={() => setShowQueryDialog(false)} />}
```

- [ ] **Step 2: typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add app/packages/web/components/WikiPage.tsx
git commit -m "feat(s07): WikiPage 集成 query 对话框 + health/lint 面板"
```

---

### Task 3.5: 样式

**Files:** Modify `app/packages/web/app/globals.css`

**必读：** WikiQueryDialog + WikiHealthPanel 用到的 className

- [ ] **Step 1: globals.css 加 S07 样式**

在 `app/packages/web/app/globals.css` 末尾加：

```css
/* —— S07 Wiki query / health / lint —— */

/* query 对话框 modal */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-dialog {
  background: var(--bg-surface, #fff);
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e0e0e0);
}

.modal-header h3 { margin: 0; font-size: 18px; }

.modal-close {
  border: none;
  background: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-dim, #999);
  padding: 0 4px;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.wiki-query-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.wiki-query-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 6px;
  font-size: 14px;
}

.wiki-query-result {
  border-top: 1px solid var(--border, #e0e0e0);
  padding-top: 16px;
}

.wiki-query-citations {
  margin: 12px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.citation-tag {
  background: var(--bg-hover, #f0f0f0);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
}

.wiki-query-error {
  color: #d32f2f;
  background: #fef0f0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  margin: 8px 0;
}

/* health/lint 面板 */
.wiki-health-panel {
  margin-bottom: 16px;
}

.wiki-health-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.wiki-health-summary {
  font-size: 14px;
  color: var(--text-dim, #666);
  margin-bottom: 8px;
}

.health-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.health-pill-red { background: #fef0f0; color: #d32f2f; }
.health-pill-yellow { background: #fff8e1; color: #f57c00; }
.health-pill-green { background: #e8f5e9; color: #388e3c; }

.wiki-lint-result {
  margin-top: 16px;
  border-top: 1px solid var(--border, #e0e0e0);
  padding-top: 12px;
}

.wiki-lint-header {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}
```

> 注意：CSS 变量名需对齐 globals.css 已有的 `:root` 变量。执行者应先看 globals.css 顶部的变量定义，用已有的；如果没有对应变量，直接用注释里的回退值。

- [ ] **Step 2: Commit**

```bash
git add app/packages/web/app/globals.css
git commit -m "feat(s07): query 对话框 + health/lint 面板样式"
```

---

### Task 3.6: 端到端验收 + handoff

**必读：** spec §6（全部验收标准）

- [ ] **Step 1: 完整 typecheck**

Run: `cd app && pnpm -r typecheck`
Expected: 全绿

- [ ] **Step 2: 端到端手动验收**

准备环境变量（如要测 query/lint 的 LLM 链路）：
```bash
export WIKI_LLM_PROVIDER=openai
export WIKI_LLM_API_KEY=<你的key>
export WIKI_LLM_MODEL=gpt-4o
```

Run: `cd app && pnpm dev`

打开浏览器 `http://localhost:3000/wiki`，逐项验证 spec §6：

§6.1 工程：
- [ ] `pnpm -r typecheck` 全绿
- [ ] `pnpm dev` 起 server + web

§6.2 query（核心）：
- [ ] `/wiki` 页面有"问答"按钮，点击弹出对话框
- [ ] 输入问题 → 提交 → 等待 → 渲染 markdown 答案
- [ ] 答案下方显示引用来源
- [ ] "存为 wiki 页" → 左侧列表实时出现新页
- [ ] 无 wiki 页时返回"没有找到相关页面"

§6.3 health（零 LLM）：
- [ ] "结构检查"按钮 → 瞬时返回
- [ ] 孤儿页/断链/空短页检测正确
- [ ] 表格 + 状态 pill 展示

§6.4 lint（LLM）：
- [ ] "语义检查"按钮 → 异步等待
- [ ] 返回 markdown 报告
- [ ] 无 key 时提示错误（不崩溃）

§6.5 回归：
- [ ] S01-S06 全不破坏（看板/详情/执行/squad/skills/wiki 浏览器）

- [ ] **Step 3: 写 handoff**

写 `app/.progress/s07-impl-3.md`，必须包含：
- 完成了什么（WikiQueryDialog + WikiHealthPanel + WikiPage 集成 + 样式）
- 端到端验收结果（逐项勾 spec §6）
- 与 spec 的偏离及原因
- 是否配了 key 实测 LLM 链路

- [ ] **Step 4: Commit + push**

```bash
git add app/.progress/s07-impl-3.md
git commit -m "docs(s07): impl-3 handoff（前端 query/health/lint + 端到端验收）"
git push origin feat/s07-query-health-lint
```

---

## 验收总览（计划者对照）

spec §6 全部验收项 → Task 映射：

| spec §6 验收项 | 对应 Task |
|---|---|
| §6.1 typecheck / pnpm dev | 全部 Task typecheck step + Task 3.6 |
| §6.2 query 问答 + 引用 + 存回 | Task 2.1 query.ts + Task 2.3 POST /query + Task 3.2 WikiQueryDialog + Task 3.6 |
| §6.3 health 结构检查 | Task 1.4 health.ts + Task 2.3 GET /health + Task 3.3 WikiHealthPanel + Task 3.6 |
| §6.4 lint 语义检查 | Task 2.2 lint.ts + Task 2.3 POST /lint + Task 3.3 WikiHealthPanel + Task 3.6 |
| §6.5 回归 S01-S06 | Task 3.6 端到端验收 |

spec 决策 Q1-Q8 → Task 映射：

| 决策 | 对应 Task |
|---|---|
| Q1 三合一 | 全计划 |
| Q2 query 弹出对话框 | Task 3.2 WikiQueryDialog |
| Q3 llm-wiki-agent 分层检索 | Task 2.1 query.ts（keywordMatch + llmSelectPages + cap 15） |
| Q4 存回 wiki | Task 2.3 POST /pages + Task 3.2 存回按钮 |
| Q5 两分层按钮 + 表格 | Task 3.3 WikiHealthPanel |
| Q6 复用 S06 LLM 工厂 | Task 2.1/2.2 import createLlm/generateWikiPage |
| Q7 store 扩展 readIndex/readLog | Task 1.2 |
| Q8 appendLog 多类型 | Task 1.3 |

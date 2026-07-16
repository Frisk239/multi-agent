# S07 设计 spec — Wiki query + health + lint

> 状态：草案（待用户复核） · 日期：2026-07-16 · 切片：S07（Phase 2 第二切片）· 建议分支：`feat/s07-query-health-lint`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/synthesis.md](../../../design/synthesis.md) §4 知识层 · [concepts/llm-wiki-pattern.md](../../../concepts/llm-wiki-pattern.md) §Operations · [references/wiki.md](../../../references/wiki.md) llm-wiki-agent 节 · [S06 spec](./2026-07-15-s06-wiki-design.md) §1.3 排除项
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分

## 0. 摘要

S07 是 Phase 2（Wiki 知识层）的第二切片。在 S06（存储 + ingest + 浏览器）之上，补齐知识层的**查询 + 维护**操作：query（分层检索 + LLM 合成答案 + 引用 + 存回）、health（零 LLM 结构检查）、lint（LLM 语义检查）。

**一句话验收：** /wiki 页面能问答（答案带引用 + 可存回）+ 能一键结构检查（孤儿页/断链/空短页）+ 能一键语义检查（矛盾/过期/缺引用）。

---

## 1. 范围与架构边界

### 1.1 数据流

```
─── query ───
用户在 /wiki 对话框输入问题
  → POST /api/wiki/query { question }
  → 服务端读 index.md → 关键词匹配找候选页（CJK 感知）
  → 命中 ≤1 页时：LLM 从 index 选页（单次 JSON，非 tool use）
  → 塞 ≤15 页内容进 prompt（每页截断 1500 字）→ LLM 合成答案 + 引用
  → 返回 { answer, citations: [{slug, title}] }
  → 前端对话框渲染答案 + 引用列表
  → 用户可点"存为 wiki 页" → POST /api/wiki/pages → 写入 wiki/

─── health（零 LLM）───
用户点"结构检查"按钮
  → GET /api/wiki/health
  → 服务端扫 wiki/*.md：
    - 孤儿页（零入链）
    - 断链（[text](xxx.md) 目标不存在）
    - 空/短页（正文 <100 字）
  → 返回 { orphans[], brokenLinks[], stubs[], total }
  → 前端表格 + 状态 pill 展示

─── lint（LLM）───
用户点"语义检查"按钮
  → POST /api/wiki/lint
  → 服务端读 ≤20 页（截断 1500 字/页）→ LLM 查矛盾/过期/缺交叉引用/需深化
  → 返回 { report, checkedPages[] }
  → 前端 MarkdownBody 渲染报告
```

### 1.2 S07 三块

| 块 | 内容 |
|---|---|
| **query** | 关键词匹配 + LLM 选页 fallback + 合成答案 + 引用 + 存回 wiki |
| **health** | 零 LLM 结构检查：孤儿页 / 断链 / 空短页 |
| **lint** | LLM 语义检查：矛盾 / 过期声明 / 缺交叉引用 / 需深化 |

### 1.3 不在范围内（YAGNI + 留 S08/后续）

| 排除 | 归属 |
|---|---|
| AGENTS.md 桥梁（Wiki → 更新 AGENTS.md） | S08 |
| ingest 队列 + DLQ（失败重试） | S08 |
| wiki 页实体/概念分类 | S08+ |
| heal（自动修复缺失页——llm-wiki-agent heal.py） | 后续 |
| graph.json 图感知检查（hub/bridge/community） | 后续（照 llm-wiki-agent lint.py:107-227） |
| 答案格式变体（slide/chart/canvas） | 永不做（照 concepts，只做 markdown） |
| 向量搜索 / BM25 | 不做（百页规模内 index 够用） |
| wiki 页编辑 UI | 永不做（照 concepts：Agent 写，人只读） |

---

## 2. 决策记录（brainstorm）

| 代号 | 决议 | 依据 |
|---|---|---|
| Q1 | 三合一：query + health + lint 全做 | query 是核心交互，health 很轻顺手做，lint 复用 query 的 LLM 基础设施 |
| Q2 | query UI = 弹出对话框 | 不占 wiki 浏览器主区域 |
| Q3 | query 检索 = llm-wiki-agent 分层（关键词匹配 index + LLM 选页 fallback + 塞 ≤15 页） | 标杆参考；零基础设施；CJK 感知；百页规模内够用 |
| Q4 | query 答案支持"存为 wiki 页" | concepts："good answers can be filed back into the wiki" |
| Q5 | health/lint 两分层按钮 + 表格 + 状态 pill | 照 llm-wiki-agent 的 health.py/lint.py 两分层；结构检查瞬时零 LLM，语义检查异步 LLM |
| Q6 | query/lint 复用 S06 的 LLM 双 provider 工厂 | `createLlm()` 已就绪，环境变量不变（`WIKI_LLM_*`） |
| Q7 | store.ts 扩展：加 `readIndex()` + `readLog()` | S06 的 listWikiPages/readWikiPage 不含 index.md/log.md 读取 |
| Q8 | query 存回的 wiki 页来源标 `query`（非 `issue`） | appendLog 已支持 type 参数扩展 |

---

## 3. query 管线详细设计

### 3.1 检索分层（照 llm-wiki-agent `query.py`）

```
用户问题
  │
  ▼
Step 1: 关键词匹配 index.md
  ├─ 解析 index.md 的 markdown 链接 → [{slug, title}]
  ├─ 问题分词（空格分词 + CJK 双字 gram）
  └─ 匹配：title 中出现问题的词 → 候选页
  │
  ├─ 命中 ≥2 页 → 直接用候选页
  │
  └─ 命中 ≤1 页 → Step 2: LLM 选页 fallback
      ├─ 把 index.md 全文发给 LLM（用 WIKI_LLM_MODEL，单次调用）
      ├─ prompt："以下 wiki index，哪些页最相关？只返回 JSON 数组 [slug1, slug2, ...]"
      └─ 解析 JSON → 候选页
  │
  ▼
Step 3: 塞 ≤15 页进 prompt
  ├─ 逐页 readWikiPage(slug) → content
  ├─ 截断每页 1500 字（照 lint.py:289 的截断策略）
  ├─ cap 15 页（照 query.py:81）
  └─ 拼成 context block
  │
  ▼
Step 4: LLM 合成答案 + 引用
  ├─ prompt = 系统("你是 wiki 知识助手，基于以下 wiki 页回答问题，标注引用来源") + context + 问题
  ├─ LLM 调用 → 答案 markdown
  └─ 引用 = Step 3 实际塞进的页列表 [{slug, title}]
```

### 3.2 query 函数（`server/src/wiki/query.ts`）

```typescript
const MAX_PAGES = 15;        // cap（照 llm-wiki-agent query.py:81）
const MAX_CHARS_PER_PAGE = 1500; // 截断（照 lint.py:289）

export async function queryWiki(question: string): Promise<{
  answer: string;
  citations: { slug: string; title: string }[];
}> {
  // Step 1: 关键词匹配 index
  const indexEntries = readIndex();       // store.ts 新增（Q7）
  let candidates = keywordMatch(indexEntries, question);

  // Step 2: LLM 选页 fallback（≤1 页命中时）
  if (candidates.length <= 1) {
    candidates = await llmSelectPages(indexEntries, question);
  }

  // Step 3: 塞 ≤15 页
  const pages = candidates
    .slice(0, MAX_PAGES)
    .map((slug) => readWikiPage(slug))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (pages.length === 0) {
    return { answer: 'Wiki 中没有找到相关页面。', citations: [] };
  }

  const context = pages
    .map((p) => `--- ${p.title} (${p.slug}) ---\n${p.content.slice(0, MAX_CHARS_PER_PAGE)}`)
    .join('\n\n');

  // Step 4: LLM 合成
  const llm = createLlm();
  const prompt = buildQueryPrompt(question, context, pages);
  const answer = await generateWikiPage(llm, prompt); // 复用 llm.ts 的 invoke 封装

  return {
    answer,
    citations: pages.map((p) => ({ slug: p.slug, title: p.title })),
  };
}
```

### 3.3 关键词匹配（CJK 感知）

照 llm-wiki-agent query.py:30-55 的 CJK 感知分词。ASCII 词用空格分词（长度 ≥2），CJK 用双字 gram 滑动窗口。

```typescript
function keywordMatch(
  entries: { slug: string; title: string }[],
  question: string,
): { slug: string; title: string }[] {
  const matched: { slug: string; title: string }[] = [];
  for (const entry of entries) {
    if (titleMatchesQuestion(entry.title, question)) {
      matched.push(entry);
    }
  }
  return matched;
}

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
```

### 3.4 LLM 选页 fallback

```typescript
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
    // JSON 解析失败 → 退回空（调用方处理）
    return [];
  }
}
```

### 3.5 query prompt

```typescript
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
```

### 3.6 存回 wiki

用户点"存为 wiki 页" → 前端 POST `/api/wiki/pages`：

```typescript
// routes/wiki.ts 新增
app.post('/api/wiki/pages', async (req, reply) => {
  const { title, content } = req.body as { title: string; content: string };
  const slug = generateSlug('query', title); // 来源标 query，非 issue identifier
  writeWikiPage(slug, content);
  appendIndex({ slug, title, identifier: 'query' });
  appendLog({ type: 'ingest', identifier: 'query', issueId: 'query', slug });
  eventBus.publish({ type: 'wiki:page-created', slug, title });
  return reply.status(201).send({ slug, title });
});
```

> 存回页面用 `query-` 前缀的 slug（区别于 `FRI-XX-` 的 issue 页）。appendLog 的 issueId 字段填 `'query'`（复用现有字段，不扩 schema）。

---

## 4. health + lint 管线设计

### 4.1 health（零 LLM 结构检查）

照 llm-wiki-agent `health.py`，三个检查项：

**检查 1：孤儿页**（零入链）—— 扫描所有 wiki 页的 markdown 链接 `[text](slug.md)`，统计每页被引用次数。零次引用 = 孤儿页。

**检查 2：断链** —— `[text](xxx.md)` 的目标 slug 不在 wiki 页集合中（排除 index.md/log.md/http 链接）。

**检查 3：空/短页** —— 去掉首行标题后的正文 <100 字（照 health.py:52-66）。

```typescript
// wiki/health.ts
export function checkHealth(): {
  orphans: { slug: string; title: string }[];
  brokenLinks: { from: string; to: string }[];
  stubs: { slug: string; title: string; bodyChars: number }[];
  total: number;
} {
  const pages = listWikiPages();                    // store.ts（已有）
  const allSlugs = new Set(pages.map((p) => p.slug));
  const inboundCount = new Map<string, number>();   // slug → 被引用次数
  const brokenLinks: { from: string; to: string }[] = [];

  for (const p of pages) inboundCount.set(p.slug, 0);

  for (const p of pages) {
    const content = readWikiPage(p.slug)!.content;
    const links = content.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
    for (const link of links) {
      const targetSlug = link[2].replace(/\.md$/, '');
      if (allSlugs.has(targetSlug)) {
        inboundCount.set(targetSlug, (inboundCount.get(targetSlug) ?? 0) + 1);
      } else {
        if (link[2] !== 'index.md' && link[2] !== 'log.md' && !link[2].startsWith('http')) {
          brokenLinks.push({ from: p.slug, to: link[2] });
        }
      }
    }
  }

  const orphans = pages.filter((p) => (inboundCount.get(p.slug) ?? 0) === 0);

  const stubs = pages
    .map((p) => {
      const content = readWikiPage(p.slug)!.content;
      const body = content.replace(/^#\s+.+$/m, '').trim();
      return { slug: p.slug, title: p.title, bodyChars: body.length };
    })
    .filter((p) => p.bodyChars < 100);

  return { orphans, brokenLinks, stubs, total: pages.length };
}
```

**API：**

```typescript
// GET /api/wiki/health — 零 LLM，瞬时返回
app.get('/api/wiki/health', async () => {
  return checkHealth();
});
```

### 4.2 lint（LLM 语义检查）

照 llm-wiki-agent `lint.py:280-298`，读 ≤20 页（截断 1500 字/页）发给 LLM，查四类问题。

```typescript
// wiki/lint.ts
const MAX_LINT_PAGES = 20;
const MAX_LINT_CHARS = 1500;

export async function checkLint(): Promise<{
  report: string;
  checkedPages: { slug: string; title: string }[];
}> {
  const pages = listWikiPages().slice(0, MAX_LINT_PAGES);
  const context = pages
    .map((p) => {
      const content = readWikiPage(p.slug)!.content.slice(0, MAX_LINT_CHARS);
      return `--- ${p.title} (${p.slug}) ---\n${content}`;
    })
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

**API：**

```typescript
// POST /api/wiki/lint — 触发 LLM 调用，前端等返回
app.post('/api/wiki/lint', async () => {
  return await checkLint();
});
```

> 用 POST（不是 GET）因为触发 LLM 调用，语义上是一次"执行"而非"读取"。

### 4.3 store.ts 扩展（Q7）

**readIndex()：**

```typescript
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
```

**readLog()：**

```typescript
export function readLog(): string {
  const logPath = join(getWikiDir(), 'log.md');
  if (!existsSync(logPath)) return '';
  return readFileSync(logPath, 'utf-8');
}
```

**appendLog 扩展** —— 当前只有 ingest/ingest-failed 两个分支，扩展为多类型：

```typescript
export function appendLog(entry: {
  type: string;  // 'ingest' | 'ingest-failed' | 'query' | 'health' | 'lint'
  identifier: string;
  issueId: string;
  slug?: string;
  error?: string;
}): void {
  const logPath = join(getWikiDir(), 'log.md');
  const date = new Date().toISOString().slice(0, 10);
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
  if (!existsSync(logPath)) {
    writeFileSync(logPath, '# Wiki Log\n', 'utf-8');
  }
  appendFileSync(logPath, block, 'utf-8');
}
```

> 破坏性改动：appendLog 是 S06 已有的函数，S07 扩展其 type 分支。原 ingest/ingest-failed 行为不变（分支逻辑一致，只是从 if/else 改成 switch）。

---

## 5. shared 契约 + API + 前端

### 5.1 shared 契约扩展

```typescript
// shared/src/schema.ts 新增（S07）

// —— query ——
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

// —— health ——
export const WikiHealthResult = z.object({
  orphans: z.array(z.object({ slug: z.string(), title: z.string() })),
  brokenLinks: z.array(z.object({ from: z.string(), to: z.string() })),
  stubs: z.array(z.object({ slug: z.string(), title: z.string(), bodyChars: z.number() })),
  total: z.number(),
});
export type WikiHealthResult = z.infer<typeof WikiHealthResult>;

// —— lint ——
export const WikiLintResult = z.object({
  report: z.string(),
  checkedPages: z.array(z.object({ slug: z.string(), title: z.string() })),
});
export type WikiLintResult = z.infer<typeof WikiLintResult>;

// —— 存回 wiki ——
export const CreateWikiPageInput = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});
export type CreateWikiPageInput = z.infer<typeof CreateWikiPageInput>;
```

> 不新增 WS 事件——存回 wiki 复用 S06 的 `WikiPageCreatedEvent`（`{type: 'wiki:page-created', slug, title}`）。

### 5.2 API 总览

| 方法 | 路径 | 说明 | LLM |
|---|---|---|---|
| POST | `/api/wiki/query` | body: `{question}` → `{answer, citations[]}` | 是 |
| GET | `/api/wiki/health` | 结构检查 → `{orphans[], brokenLinks[], stubs[], total}` | 否 |
| POST | `/api/wiki/lint` | 语义检查 → `{report, checkedPages[]}` | 是 |
| POST | `/api/wiki/pages` | 存回：body `{title, content}` → `{slug, title}` + WS | 否 |

> S06 的 GET /api/wiki/pages + GET /api/wiki/pages/:slug 不变。

### 5.3 前端——query 对话框

wiki 浏览器页右上角加"问答"按钮 → 弹出 modal：

```
┌─────────────────────────────────────────┐
│  Wiki 问答                          [×] │
├─────────────────────────────────────────┤
│  ┌───────────────────────────┐ [提问]  │
│  │ 输入你的问题...            │         │
│  └───────────────────────────┘         │
│                                         │
│  ── 答案 ──                             │
│  (markdown 渲染，复用 MarkdownBody)     │
│                                         │
│  引用来源：                              │
│  • 页面标题1  • 页面标题2               │
│                                         │
│              [存为 wiki 页]             │
└─────────────────────────────────────────┘
```

组件结构：
- `WikiQueryDialog`（新组件）：modal + 输入框 + 提交 + 答案渲染 + 引用列表 + 存回按钮
- 提交 → `useWikiQuery()` mutation → POST /api/wiki/query
- 存回 → `useCreateWikiPage()` mutation → POST /api/wiki/pages → 关闭对话框 + invalidate wiki-pages

### 5.4 前端——health/lint 面板

wiki 浏览器页顶部（列表上方）加两个按钮 + 结果区：

```
┌──────────────────────────────────────────────┐
│  [结构检查]  [语义检查]                        │
│                                                │
│  ── 结构检查结果 ──（点击后出现）              │
│  ┌──────────────────────────────────────────┐ │
│  │ 总页数: 8  孤儿: 2  断链: 0  空短: 1     │ │
│  ├──────────┬────────────┬────────┬────────┤ │
│  │ 类型     │ 页面        │ 详情   │ 操作   │ │
│  │ 🔴 孤儿  │ FRI-04-xxx │ 0 入链 │ 跳转   │ │
│  │ 🟡 空短  │ FRI-07-xxx │ 45 字  │ 跳转   │ │
│  └──────────┴────────────┴────────┴────────┘ │
│                                                │
│  ── 语义检查报告 ──（点击后异步出现）          │
│  (LLM 返回的 markdown 报告，复用 MarkdownBody) │
└──────────────────────────────────────────────┘
```

组件结构：
- 结构检查 → `useWikiHealth()` query（点击触发 fetch）→ 表格 + 状态 pill
- 语义检查 → `useWikiLint()` mutation（POST，等返回）→ MarkdownBody 渲染报告
- 状态 pill 复用原型已有的 `.status-dot-green` 视觉词汇（🔴/🟡/✅）

### 5.5 前端 hooks

```typescript
// api.ts 新增
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

export function useWikiLint() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/wiki/lint`, { method: 'POST' });
      if (!res.ok) throw new Error('语义检查失败');
      return res.json() as Promise<WikiLintResult>;
    },
  });
}

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

---

## 6. 验收标准

### 6.1 工程
- [ ] `pnpm -r typecheck` 全绿
- [ ] `pnpm dev` 起 server + web
- [ ] 配 `WIKI_LLM_*` 环境变量后 query/lint 能调 LLM

### 6.2 query（核心）
- [ ] `/wiki` 页面有"问答"按钮，点击弹出对话框
- [ ] 输入问题 → 提交 → 等待 → 右侧渲染 markdown 答案
- [ ] 答案下方显示引用来源（页面标题列表）
- [ ] 关键词命中 ≥2 页时不调 LLM 选页（直接用候选）
- [ ] 关键词命中 ≤1 页时触发 LLM 选页 fallback
- [ ] 塞入页数 ≤15（cap）
- [ ] "存为 wiki 页"按钮 → 写入 wiki/ → 左侧列表实时出现新页（WS）
- [ ] 无 wiki 页时返回"没有找到相关页面"

### 6.3 health（零 LLM）
- [ ] "结构检查"按钮 → 瞬时返回
- [ ] 孤儿页检测正确（零入链的页）
- [ ] 断链检测正确（`[text](xxx.md)` 目标不存在）
- [ ] 空/短页检测正确（正文 <100 字）
- [ ] 结果表格 + 状态 pill（🔴/🟡/✅）展示
- [ ] "跳转"按钮可定位到问题页

### 6.4 lint（LLM）
- [ ] "语义检查"按钮 → 异步等待（Loading 状态）
- [ ] 返回 markdown 报告，用 MarkdownBody 渲染
- [ ] 报告含矛盾/过期/缺交叉引用/需深化 四类
- [ ] 无 API key 时提示错误（不崩溃）

### 6.5 回归
- [ ] S01-S06 全不破坏
- [ ] S06 ingest 正常（Issue done → wiki 页生成）
- [ ] wiki 浏览器浏览正常（S06 的左列表右渲染不变）

---

## 7. Borrow matrix

| ID | 能力 | 主抄 | 锚点 | 落点 | 不抄 |
|---|---|---|---|---|---|
| G-QUERY | 分层检索 | llm-wiki-agent query.py | query.py:30-135 | query.ts keywordMatch + llmSelectPages + cap 15 | graph.json 邻居扩展 |
| G-HEALTH | 零 LLM 结构检查 | llm-wiki-agent health.py | health.py:52-119 | health.ts 孤儿/断链/空短 | log coverage 检查 |
| G-LINT | LLM 语义检查 | llm-wiki-agent lint.py | lint.py:280-298 | lint.ts ≤20 页截断 1500 字 → LLM | 图感知检查（hub/bridge/community）|
| G-FILE-BACK | 答案存回 | concepts | concepts §Query "filed back" | POST /api/wiki/pages | 答案格式变体（slide/chart）|
| G-HEALTH-UI | 状态表格 | prototype renderRuntime | app.js:702-747 | 状态 pill + 表格 | 运行时健康度本身 |
| G-STORE-EXT | store 扩展 | llm-wiki-agent index 解析 | query.py:30-55 | readIndex/readLog + appendLog 多类型 | graph.json |

---

## 8. 风险

| 风险 | 缓解 |
|---|---|
| LLM 选页返回非合法 JSON | try/catch → 退回空候选 → 返回"未找到" |
| wiki 页为零时 query/health/lint 全空 | query 返回提示文案；health 返回 total=0；lint 跳过 |
| lint 读 20 页可能超 context window | 每页截断 1500 字 × 20 = 30k 字，主流模型够用；不够再减 |
| 关键词匹配 CJK 分词精度 | 双字 gram 是粗粒度但够用（llm-wiki-agent 同策略）；有 LLM fallback 兜底 |
| 存回 wiki 页 slug 冲突 | `query-` 前缀区分，不与 `FRI-XX-` 冲突；极端重名文件覆盖可接受（append-only log 有记录）|
| query 对话框 UX | modal 最简实现；不阻塞 wiki 浏览 |

---

## 9. 自审记录

自审对照真实代码库 + S06 产出逐项验证（store.ts、schema.ts、llm.ts、routes/wiki.ts、ws.ts、api.ts）。

| 检查项 | 结果 |
|---|---|
| Placeholder | 无 TBD/TODO；所有 prompt 和函数签名确定 |
| 内部一致 | Q1-Q8 与 query/health/lint/API/前端一致 |
| 范围 | 三块清晰，排除项明确（§1.3）|
| 歧义 | query 检索分层（Step1-4）、health 零 LLM vs lint LLM、POST vs GET 语义 均消歧 |
| 与 S06 共存 | 复用 store.ts（扩展 readIndex/readLog/appendLog）、llm.ts（createLlm/generateWikiPage）、routes/wiki.ts（新增 3 端点）、WikiPageCreatedEvent（存回复用）|
| Borrow | §7 完整，6 项有 file:line 锚点 |
| concepts 对齐 | query（读 index → 合成 + 引用 + 存回）、lint（矛盾/过期/孤儿/缺页/缺引用/数据缺口）四操作 S07 做三（query/health/lint），heal 留后续 |
| **appendLog 破坏性** | S06 的 appendLog 从 if/else 改 switch，原 ingest/ingest-failed 行为不变（分支逻辑一致）。issues.ts 调用方不受影响（传 'ingest'/'ingest-failed' 不变）|
| **generateWikiPage 复用** | S06 的 generateWikiPage(llm, prompt) 返回 string，query/lint 直接复用——签名兼容（接收 BaseChatModel + string，返回 string）|
| **POST /api/wiki/pages 与 S06 无冲突** | S06 的 routes/wiki.ts 只有 GET /api/wiki/pages + GET /api/wiki/pages/:slug，新增 POST 不冲突 |
| **useWikiHealth enabled: false** | React Query 的 enabled:false 意味着不自动 fetch，需手动 refetch()——前端点击按钮时调 refetch 触发。正确 |
| **readIndex regex** | `/^-\s+\[([^\]]+)\]\(([^)]+)\)/gm` 匹配 appendIndex 写的 `- [标题](slug.md) — xxx` 格式。S06 appendIndex line 77 的格式一致 |
| **lint POST 语义** | POST 用于"触发执行"（LLM 调用有副作用——花 token）；GET /health 是纯读（零 LLM）。区分合理 |

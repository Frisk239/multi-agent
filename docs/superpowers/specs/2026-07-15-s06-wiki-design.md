# S06 设计 spec — Wiki 存储 + 浏览器 + ingest 管线

> 状态：草案（待用户复核） · 日期：2026-07-15 · 切片：S06（Phase 2 第一个切片）· 建议分支：`feat/s06-wiki`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/synthesis.md](../../../design/synthesis.md) §4 知识层 · [concepts/llm-wiki-pattern.md](../../../concepts/llm-wiki-pattern.md) · [references/wiki.md](../../../references/wiki.md) · [chanpin/prototype/data/seed.js](../../../chanpin/prototype/data/seed.js) wikiPages[]
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分

## 0. 摘要

S06 是 Phase 2（Wiki 知识层，毕设创新点）的第一个切片。端到端打通最薄 Wiki ingest 路径：Issue 完成（status→done）→ ingest pipeline 读 Issue 内容 → LangChain LLM 生成 wiki 页 markdown → 写 `wiki/` 目录 → 更新 index/log → WS 推前端 → 浏览器 `/wiki` 实时展示。

**一句话验收：** PUT issue status=done → `wiki/` 目录自动出现 LLM 生成的总结页 → `/wiki` 浏览器可见。

---

## 1. 范围与架构边界

### 1.1 数据流

```
Issue status → done（PUT /api/issues/:id status=done）
  → ingest pipeline 异步触发（fire-and-forget，不阻塞 PUT 响应）
  → 读 Issue 标题 + description + comments（K=20）
  → 存 wiki/raw/issue-<id>-<timestamp>.md（不可变快照）
  → LangChain LLM（双 provider：OpenAI 兼容 / Anthropic）生成 wiki 页 markdown
  → 写 wiki/<slug>.md
  → 更新 wiki/index.md（追加条目）
  → append wiki/log.md（ingest 日志）
  → eventBus publish wiki:page-created → WS 推前端
  → /wiki 浏览器实时出现新页
```

### 1.2 S06 三块

| 块 | 内容 |
|---|---|
| **Wiki 存储结构** | `wiki/` 目录（`*.md` 页 + `index.md` + `log.md` + `raw/` 快照）；文件读写工具 |
| **ingest pipeline** | LLM 调用（LangChain 双 provider）+ 内容生成 + 写文件 + 更新 index/log；Issue 完成时自动触发 |
| **Wiki 浏览器 UI** | `/wiki` 路由：左侧页面列表 + 右侧 markdown 渲染；WS wiki:page-created 实时 |

### 1.3 不在范围内（YAGNI + 留 S07/S08）

| 排除 | 归属 |
|---|---|
| query（读 index → 答案 + 引用） | S07 |
| health（孤儿页/断链检查） | S07 |
| lint（语义矛盾检查） | S07 |
| AGENTS.md 桥梁（Wiki → 更新 AGENTS.md） | S08 |
| ingest 队列 + DLQ（失败重试） | S08 |
| wiki 页实体/概念分类 | S07+ |
| wiki 页编辑 UI | 永不做（照 concepts：Agent 写，人只读） |

---

## 2. 决策记录（brainstorm）

| 代号 | 决议 | 依据 |
|---|---|---|
| W1 | Phase 2 拆三切片：S06（存储+UI+ingest）/ S07（query+health+lint）/ S08（AGENTS.md 桥梁+队列） | 功能块多，单切片做不完 |
| W2 | 文件系统 markdown 存储（不进 DB） | 照 concepts + openwiki + llm-wiki-agent |
| W3 | Issue 完成（status→done）时自动触发 ingest | synthesis「编排事件驱动 Wiki ingest」 |
| W4 | LangChain.js 直调 API（不碰执行层 CLI） | ingest 是内容生成不是 Agent 执行；synthesis §2.4 预留 |
| W5 | 项目根 `wiki/` 目录 | 随项目走，git 可版本化 |
| W6 | 双 LLM provider 支持（OpenAI 兼容 + Anthropic），默认 openai | OpenAI Chat Completions 是主流兼容格式（含国产/本地/Ollama） |
| W7 | ingest 异步 fire-and-forget，不阻塞 PUT | LLM 调用耗时数秒 |
| W8 | ingest 失败只记日志不重试 | DLQ 留 S08 |

---

## 3. Wiki 存储结构

### 3.1 目录布局（项目根 `wiki/`）

```
wiki/
├── index.md          目录页（所有 wiki 页的清单，ingest 时更新）
├── log.md            日志（append-only，每次 ingest 追加一条）
├── raw/              不可变源（Issue 内容快照）
│   └── issue-<id>-<timestamp>.md
└── *.md              wiki 页（LLM 生成）
```

### 3.2 index.md 格式（照 concepts）

```markdown
# Wiki Index

## Pages
- [毕设 multi-agent](fri-11-毕设multi-agent.md) — 产出 PRD 与可交互原型（2026-07-15）
```

ingest 时读取现有 index → 追加新条目 → 重写。

### 3.3 log.md 格式（照 concepts）

```markdown
# Wiki Log

## [2026-07-15] ingest | FRI-11
- Source: issue/iss-11
- Page: fri-11-毕设multi-agent.md
```

append-only。前缀 `## [date] ingest | <identifier>` 可 grep。失败用 `ingest-failed` 前缀。

### 3.4 raw/ 快照

Issue 完成时，Issue 标题 + description + comments 存成 `raw/issue-<id>-<timestamp>.md`。不可变。

### 3.5 wiki 页格式

LLM 生成的纯 markdown。文件名 = `<identifier>-<slug>.md`（slug 从标题生成，ASCII 安全但保留中文）。无 frontmatter（S06 简单）。

### 3.6 目录定位

`getWikiDir()` 照 S05 `scanner.ts` 的模式：

```typescript
import { resolve } from 'node:path';
function getWikiDir(): string {
  const cwd = process.env.MA_WORKSPACE_CWD;
  // MA_WORKSPACE_CWD 未设时回退 process.cwd()（开发期 = app/）
  return resolve(cwd && cwd.length > 0 ? cwd : process.cwd(), 'wiki');
}
```

与 S05 scanner 对齐：同一 workspace 定位逻辑。

### 3.7 文件读写工具（`server/src/wiki/store.ts`）

**slug 不含 `.md` 扩展名**——API 层和前端只打交道不含扩展名的 slug，扩展名仅在 `readWikiPage`/`writeWikiPage` 内部拼接。

- `listWikiPages()`：扫 `getWikiDir()/*.md`（排除 index.md/log.md）→ `[{slug, title}]`。slug = 去掉 `.md` 的文件名；title 从首行 `# ` 提取
- `readWikiPage(slug)`：读 `getWikiDir()/<slug>.md` → `{slug, title, content}`
- `writeWikiPage(slug, content)`：写 `getWikiDir()/<slug>.md`
- `appendIndex(entry)`：读 index.md → 追加 → 重写
- `appendLog(entry)`：append log.md
- `saveRaw(issueId, content)`：写 `getWikiDir()/raw/issue-<id>-<ts>.md`
- `ensureWikiDir()`：启动时确保 wiki/ + raw/ 存在（不存在则建 + 写初始 index.md/log.md）

---

## 4. ingest pipeline

### 4.1 触发条件

**PUT issue `status` 变成 `done`** 时触发 ingest。这是唯一触发点。

> 不是 run completed 触发——run completed 只代表一次执行完成，Issue 可能还在 in_progress。ingest 是"Issue 完结"的事件。

### 4.2 ingest 函数（`server/src/wiki/ingest.ts`）

```typescript
export async function ingestIssue(issueId: string): Promise<void> {
  // 1. 读 Issue 内容
  const issue = loadIssue(issueId);
  const comments = loadComments(issueId, 20);
  const sourceText = formatSource(issue, comments);

  // 2. 存 raw 快照
  saveRaw(issueId, sourceText);

  // 3. LLM 生成 wiki 页
  const llm = createLlm();
  const prompt = buildIngestPrompt(issue, sourceText);
  const result = await llm.invoke(prompt);
  const wikiContent = result.content.toString();

  // 4. 写 wiki 页
  const slug = generateSlug(issue.identifier, issue.title);
  writeWikiPage(slug, wikiContent);

  // 5. 更新 index + log
  appendIndex({ slug, title: issue.title, identifier: issue.identifier });
  appendLog({ type: 'ingest', identifier: issue.identifier, issueId, slug });

  // 6. WS 通知
  eventBus.publish({ type: 'wiki:page-created', slug, title: issue.title });
}
```

### 4.3 LLM 配置（双 provider，W6）

环境变量：

| 变量 | 说明 | 默认 |
|---|---|---|
| `WIKI_LLM_PROVIDER` | `anthropic` \| `openai` | `openai` |
| `WIKI_LLM_API_KEY` | API 密钥（必需） | — |
| `WIKI_LLM_BASE_URL` | API 端点（openai 格式用，不传则 OpenAI 默认） | — |
| `WIKI_LLM_MODEL` | 模型名 | `gpt-4o` |

工厂函数：

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

function createLlm(): BaseChatModel {
  const provider = process.env.WIKI_LLM_PROVIDER ?? 'openai';
  const apiKey = process.env.WIKI_LLM_API_KEY;
  const model = process.env.WIKI_LLM_MODEL ?? 'gpt-4o';
  if (!apiKey) throw new Error('WIKI_LLM_API_KEY 未配置');

  if (provider === 'anthropic') {
    return new ChatAnthropic({ model, apiKey });
  }
  return new ChatOpenAI({ model, apiKey, baseURL: process.env.WIKI_LLM_BASE_URL });
}
```

> **LangChain 的价值**：`BaseChatModel` 统一接口。切换 provider 只改环境变量。OpenAI 兼容格式覆盖 OpenAI/智谱/通义/Ollama/vLLM 等。

### 4.4 LLM prompt

```
你是一个项目 Wiki 维护者。以下是一个已完成的 Issue 的完整内容。请生成一个 Wiki 页（markdown），总结这个 Issue 的关键信息：做了什么、关键决策、产出。

Issue {identifier}: {title}
Description: {description}

Comments（最近 {K} 条）:
{formatted comments}

请输出一个 markdown Wiki 页（以 # 标题开头），不要输出其他内容。
```

### 4.5 异步执行 + 失败处理（W7/W8）

```typescript
// issues.ts PUT handler，status=done 后：
if (statusChanged && input.status === 'done') {
  void ingestIssue(id).catch((err) => {
    console.error('[wiki] ingest 失败:', err);
    appendLog({ type: 'ingest-failed', identifier: '...', error: String(err) });
  });
}
```

fire-and-forget。失败只 console.error + log 记录。不重试（DLQ 留 S08）。不影响 Issue 完成本身。

### 4.6 依赖

server package.json 加：
```json
"@langchain/openai": "^0.3.0",
"@langchain/anthropic": "^0.3.0",
"@langchain/core": "^0.3.0"
```

---

## 5. shared 契约扩展

```typescript
export const WikiPage = z.object({
  slug: z.string(),
  title: z.string(),
  content: z.string(),
});
export type WikiPage = z.infer<typeof WikiPage>;

export const WikiPageSummary = z.object({
  slug: z.string(),
  title: z.string(),
});
export type WikiPageSummary = z.infer<typeof WikiPageSummary>;

export const WikiPageCreatedEvent = z.object({
  type: z.literal('wiki:page-created'),
  slug: z.string(),
  title: z.string(),
});
```

`DomainEvent` 联合加 `WikiPageCreatedEvent`。

---

## 6. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/wiki/pages` | 列表：扫 `wiki/*.md` → `WikiPageSummary[]` |
| GET | `/api/wiki/pages/:slug` | 单页：读 `wiki/<slug>.md` → `WikiPage` |

无 POST/PUT（Wiki 页由 ingest pipeline 写文件，人不编辑）。

---

## 7. 前端

### 7.1 路由 `/wiki`

左侧页面列表 + 右侧 markdown 渲染（复用 S02 MarkdownBody）。

### 7.2 实时（WS）

WS 收 `wiki:page-created` → 左侧列表追加新页。

### 7.3 侧栏导航

S03 侧栏 NAV_ITEMS 的 Wiki 入口（占位）激活 → `/wiki`。

---

## 8. 验收标准

### 8.1 工程
- [ ] `pnpm -r typecheck` 全绿
- [ ] `pnpm dev` 起 server + web
- [ ] 配 `WIKI_LLM_*` 环境变量后 ingest 能调 LLM

### 8.2 Wiki 存储
- [ ] `wiki/` 目录存在（index.md + log.md 初始版）
- [ ] GET /api/wiki/pages 返回列表
- [ ] GET /api/wiki/pages/:slug 返回内容

### 8.3 ingest pipeline（核心）
- [ ] PUT issue status=done → ingest 自动触发
- [ ] `wiki/raw/` 出现 Issue 快照
- [ ] `wiki/*.md` 出现 LLM 生成的 wiki 页
- [ ] `wiki/index.md` 追加条目
- [ ] `wiki/log.md` 追加日志
- [ ] WS wiki:page-created 推前端

### 8.4 Wiki 浏览器
- [ ] `/wiki` 左侧列表 + 右侧渲染
- [ ] ingest 后实时出现新页

### 8.5 回归
- [ ] S01-S05 全不破坏

---

## 9. Borrow matrix

| ID | 能力 | 主抄 | 锚点 | 落点 | 不抄 |
|---|---|---|---|---|---|
| G-WIKI-STORE | raw/wiki/index/log 四层 | concepts + openwiki | concepts §Architecture | wiki/ 目录 | 知识图层级 |
| G-INGEST | 事件驱动 ingest | synthesis §4 + llm-wiki-agent | synthesis §4 ingest 管线 | Issue done → ingestIssue | 队列+DLQ（S08）|
| G-LLM-CALL | LLM 生成 wiki 内容 | synthesis §2.4 | synthesis §2.4 LangChain | 双 provider 工厂 | CLI backend |
| G-INDEX-LOG | index.md + log.md 导航 | concepts | concepts §Indexing | appendIndex/appendLog | Dataview/frontmatter |
| G-WIKI-UI | 浏览器 | seed.js wikiPages + 原型 | app.js renderWiki | /wiki 左右栏 | 编辑 UI |

---

## 10. 风险

| 风险 | 缓解 |
|---|---|
| WIKI_LLM_API_KEY 未配置 | ingest 直接 failed（log 记录），不影响 Issue 完成 |
| LLM 输出不是合法 markdown | writeWikiPage 照写（浏览器渲染容错）；S07 lint 检查质量 |
| wiki/ 目录被 git 追踪 vs gitignore | 开发期进 git（答辩可见版本演进）；生产可 gitignore。S06 先进 git |
| 中文 slug 文件名兼容性 | slug 保留中文（现代 OS 支持）；极端情况用 identifier 兜底 |
| ingest 并发（多个 Issue 同时 done） | fire-and-forget 各自独立跑；writeWikiPage 写不同文件不冲突；index/log append 可能交错但 S06 低频可接受 |
| LangChain 版本兼容 | 版本 spike（^0.3.0），记 handoff |

---

## 11. 自审记录

自审对照真实代码库逐项验证（`issues.ts`、`event-bus.ts`、`ws-broadcaster.ts`、`schema.ts`、`scanner.ts`、`ws.ts`、`Sidebar.tsx`、`api.ts`、`ws.ts`）。

| 检查项 | 结果 |
|---|---|
| Placeholder | 无 TBD/TODO；LLM prompt 是确定的；LangChain 版本号 ^0.3.0 为占位，impl-1 安装时取实际版本 |
| 内部一致 | W1-W8 与存储/ingest/API/前端一致 |
| 范围 | 三块清晰，排除项明确（§1.3）|
| 歧义 | 触发条件（status→done 非 run completed）、LLM 双 provider、异步不阻塞 均消歧 |
| 与 S05 | 共存：S05 的 skill 注入在 prompt 层，S06 的 ingest 在独立 pipeline，互不干扰 |
| Borrow | §9 完整，5 项有锚点 |
| concepts 对齐 | raw/wiki/schema 三层 + ingest/query/lint/health 四操作（S06 只做 ingest）|
| **接入点** | `issues.ts:149` eventBus.publish(issue:updated) 之后插 ingest 触发。issues.ts 已依赖 event-bus.ts，无循环 |
| **循环依赖** | wiki/ingest.ts → event-bus.ts（单向），issues.ts → wiki/ingest.ts（单向），无环 |
| **slug 约定**（F3 修正） | slug 不含 .md；readWikiPage/writeWikiPage 内部拼扩展名（§3.7 已明确） |
| **目录定位**（F4 修正） | getWikiDir() 照 S05 scanner.ts 的 MA_WORKSPACE_CWD 模式（§3.6 已明确） |
| **WS 事件 payload**（F2 确认） | WikiPageCreatedEvent 只含 slug+title，不含 identifier——前端展示标题足够；如后续需要来源标注留 S07 |
| **WS 广播路径** | wiki:page-created → eventBus.publish → wsBroadcaster.broadcast（已有管线，§4.2 的 publish 自动到 WS） |
| **DomainEvent 联合** | shared/schema.ts DomainEvent 加 WikiPageCreatedEvent 后，ws-broadcaster 和 ws.ts handler 类型自动覆盖 |

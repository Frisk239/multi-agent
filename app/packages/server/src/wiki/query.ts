// S07 query 管线（spec §3）
// 分层检索（照 llm-wiki-agent query.py）：
// Step 1: 关键词匹配 index.md（CJK 感知）→ 候选页
// Step 2: 命中 ≤1 页时 LLM 选页 fallback（单次 JSON）
// Step 3: 塞 ≤15 页（每页截断 1500 字）
// Step 4: LLM 合成答案 + 引用
// DS3：默认仅检索所选 wiki 根（不跨根）；显式 roots:'all' 时跨根合并检索
// （global 根 + 所有 localPath 有效的 project 根，候选带根归属，cite 可区分）
import { readIndex, readWikiPage, listAllWikiRoots, type WikiRootOpts, type WikiRootRef } from './store.js';
import { createLlm, generateWikiPage } from './llm.js';

const MAX_PAGES = 15;             // cap（照 llm-wiki-agent query.py:81）
const MAX_CHARS_PER_PAGE = 1500;  // 截断（照 lint.py:289）

// 跨根检索开关（路由 body 可选字段，缺省 = 单根行为不变）
export type WikiQueryOptions = {
  roots?: 'all';
};

export type WikiCitation = { slug: string; title: string; root?: string };

// 候选页条目：跨根模式下带根引用（slug 可跨根重复，靠 root 区分）
type Entry = { slug: string; title: string; root?: WikiRootRef };

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

function keywordMatch(entries: Entry[], question: string): Entry[] {
  return entries.filter((e) => titleMatchesQuestion(e.title, question));
}

// 读 index 条目：跨根 = 逐根合并（带 root）；单根 = 所选根（root 缺省）
function readIndexEntries(opts: WikiRootOpts | undefined, acrossRoots: boolean): Entry[] {
  if (!acrossRoots) {
    return readIndex(opts).map((e) => ({ ...e, root: undefined }));
  }
  const entries: Entry[] = [];
  for (const root of listAllWikiRoots()) {
    const rootOpts = root.source === 'project' ? { projectId: root.projectId, projectLocalPath: root.projectLocalPath } : {};
    for (const e of readIndex(rootOpts)) {
      entries.push({ ...e, root });
    }
  }
  return entries;
}

// 读单页：按候选所属根读（跨根 slug 冲突时各读各的根）
function readPage(entry: Entry, opts: WikiRootOpts | undefined): { slug: string; title: string; content: string; root?: WikiRootRef } | null {
  const rootOpts = entry.root
    ? entry.root.source === 'project'
      ? { projectId: entry.root.projectId, projectLocalPath: entry.root.projectLocalPath }
      : {}
    : opts;
  const page = readWikiPage(entry.slug, rootOpts);
  return page ? { ...page, root: entry.root } : null;
}

// 无 LLM key 降级（WIKI_LLM_API_KEY 未配置）：关键词直出，不走 LLM
function isMissingLlmKey(e: unknown): boolean {
  return String(e).includes('WIKI_LLM_API_KEY');
}

function keywordOnlyAnswer(pages: { slug: string; title: string; root?: WikiRootRef }[]): string {
  const lines = pages.map((p) => `- ${p.title}（${p.slug}）${p.root ? ` [${p.root.label}]` : ''}`);
  return `关键词命中页面：\n${lines.join('\n')}`;
}

// LLM 选页 fallback（spec §3.4）
async function llmSelectPages(entries: Entry[], question: string): Promise<Entry[]> {
  const llm = createLlm();
  const indexText = entries
    .map((e) => `- ${e.title} (slug: ${e.slug}${e.root ? `, root: ${e.root.label}` : ''})`)
    .join('\n');
  const prompt = `以下是 wiki 的页面索引：

${indexText}

用户问题：${question}

哪些页面最相关？只返回一个 JSON 数组，元素是 slug 字符串。不要输出其他内容。
示例：["fri-11-xxx", "fri-04-yyy"]`;

  const raw = await generateWikiPage(llm, prompt);
  try {
    const slugs = JSON.parse(raw) as string[];
    // 同 slug 跨根重复时全部保留（root 在 Step 3 各自读页）
    return entries.filter((e) => slugs.includes(e.slug));
  } catch {
    return [];
  }
}

// query prompt（spec §3.5）；跨根时页面列表/正文带根 label，LLM 引用可区分
function buildQueryPrompt(
  question: string,
  context: string,
  pages: { slug: string; title: string; root?: WikiRootRef }[],
): string {
  const pageList = pages.map((p) => `- ${p.title}${p.root ? `（${p.root.label}）` : ''}`).join('\n');
  return `你是项目 Wiki 的知识助手。基于以下 Wiki 页面内容回答用户问题。
回答时请引用来源页面（用"（见：页面标题）"标注；若页面来自不同项目根，请注明根名）。
如果信息不足，如实说明。

可用页面：
${pageList}

页面内容：
${context}

用户问题：${question}`;
}

// 完整 query 管线（spec §3.2）
// queryOpts.roots === 'all' 时跨根检索（global + 所有有效 project 根），缺省单根行为不变
export async function queryWiki(
  question: string,
  opts?: WikiRootOpts,
  queryOpts?: WikiQueryOptions,
): Promise<{
  answer: string;
  citations: WikiCitation[];
}> {
  const acrossRoots = queryOpts?.roots === 'all';

  // Step 1: 关键词匹配 index（单根 or 跨根合并候选）
  const indexEntries = readIndexEntries(opts, acrossRoots);
  let candidates = keywordMatch(indexEntries, question);

  // Step 2: LLM 选页 fallback（≤1 页命中时；无 LLM key 则保持关键词候选）
  if (candidates.length <= 1) {
    try {
      candidates = await llmSelectPages(indexEntries, question);
    } catch (e) {
      if (!isMissingLlmKey(e)) throw e;
    }
  }

  // Step 3: 塞 ≤15 页（按候选所属根读页）
  const pages = candidates
    .slice(0, MAX_PAGES)
    .map((c) => readPage(c, opts))
    .filter((p): p is { slug: string; title: string; content: string; root?: WikiRootRef } => p !== null);

  if (pages.length === 0) {
    return { answer: 'Wiki 中没有找到相关页面。', citations: [] };
  }

  const context = pages
    .map((p) => `--- ${p.title} (${p.slug})${p.root ? ` [${p.root.label}]` : ''} ---\n${p.content.slice(0, MAX_CHARS_PER_PAGE)}`)
    .join('\n\n');

  // Step 4: LLM 合成；无 LLM key → 关键词直出降级
  let answer: string;
  try {
    const llm = createLlm();
    const prompt = buildQueryPrompt(question, context, pages);
    answer = await generateWikiPage(llm, prompt);
  } catch (e) {
    if (!isMissingLlmKey(e)) throw e;
    answer = keywordOnlyAnswer(pages);
  }

  return {
    answer,
    // 跨根模式 cite 带 root label（同 slug 可区分归属）；单根保持原形状
    citations: pages.map((p) =>
      p.root ? { slug: p.slug, title: p.title, root: p.root.label } : { slug: p.slug, title: p.title },
    ),
  };
}

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
  // candidates 是 {slug, title}[]，map 时取 slug 读页
  const pages = candidates
    .slice(0, MAX_PAGES)
    .map((c) => readWikiPage(c.slug))
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

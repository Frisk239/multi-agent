// S07 lint 语义检查（LLM，spec §4.2）
// 照 llm-wiki-agent lint.py:280-298：读 ≤20 页（截断 1500 字）→ LLM 查矛盾/过期/缺引用/需深化
// DS3：仅检查所选 wiki 根（不跨根）
import { listWikiPages, readWikiPage, type WikiRootOpts } from './store.js';
import { createLlm, generateWikiPage } from './llm.js';

const MAX_LINT_PAGES = 20;
const MAX_LINT_CHARS = 1500;

export async function checkLint(opts?: WikiRootOpts): Promise<{
  report: string;
  checkedPages: { slug: string; title: string }[];
}> {
  const allPages = listWikiPages(opts);
  const pages = allPages.slice(0, MAX_LINT_PAGES);

  if (pages.length === 0) {
    return { report: 'Wiki 中没有页面可供检查。', checkedPages: [] };
  }

  const context = pages
    .map((p) => {
      const page = readWikiPage(p.slug, opts);
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

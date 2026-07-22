// S07 health 结构检查（零 LLM，spec §4.1）
// 照 llm-wiki-agent health.py：孤儿页（零入链）/ 断链 / 空短页（正文 <100 字）
// DS3：仅检查所选 wiki 根（不跨根）
import { listWikiPages, readWikiPage, type WikiRootOpts } from './store.js';

export function checkHealth(opts?: WikiRootOpts): {
  orphans: { slug: string; title: string }[];
  brokenLinks: { from: string; to: string }[];
  stubs: { slug: string; title: string; bodyChars: number }[];
  total: number;
} {
  const pages = listWikiPages(opts);
  const allSlugs = new Set(pages.map((p) => p.slug));
  const inboundCount = new Map<string, number>();
  const brokenLinks: { from: string; to: string }[] = [];

  // 初始化入链计数
  for (const p of pages) inboundCount.set(p.slug, 0);

  // 扫每页的 markdown 链接 [text](target.md)
  for (const p of pages) {
    const page = readWikiPage(p.slug, opts);
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
      const page = readWikiPage(p.slug, opts);
      if (!page) return null;
      const body = page.content.replace(/^#\s+.+$/m, '').trim();
      return { slug: p.slug, title: p.title, bodyChars: body.length };
    })
    .filter((p): p is { slug: string; title: string; bodyChars: number } => p !== null)
    .filter((p) => p.bodyChars < 100);

  return { orphans, brokenLinks, stubs, total: pages.length };
}

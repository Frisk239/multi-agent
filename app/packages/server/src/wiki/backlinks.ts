// G4-5b：backlink ——「引用自其他页」反查（零 LLM）。
// 扫所选根全部页正文，正则匹配 [title](slug.md) 形式的内链；命中即入链。
// 与 health.ts 的入链计数同口径（matchAll /\([^)]+\.md\)/ + 去 .md）。

import { listWikiPages, readWikiPage, type WikiRootOpts } from './store.js';

export function listBacklinks(
  slug: string,
  opts?: WikiRootOpts,
): { from: string; title: string }[] {
  const pages = listWikiPages(opts);
  const out: { from: string; title: string }[] = [];
  for (const p of pages) {
    if (p.slug === slug) continue; // 自引用不计
    const page = readWikiPage(p.slug, opts);
    if (!page) continue;
    const links = page.content.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
    for (const link of links) {
      if (link[2].replace(/\.md$/, '') === slug) {
        out.push({ from: p.slug, title: p.title });
        break; // 一页只计一次
      }
    }
  }
  return out;
}

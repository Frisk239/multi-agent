// S08 AGENTS.md 桥梁（spec §3，学 multica runtime_config.go marker-pair）
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveWorkspaceCwd } from '../workspace-cwd.js';
import { listWikiPages, readLog } from './store.js';

export const MA_WIKI_BEGIN = '<!-- BEGIN MA-WIKI (auto-managed; do not edit) -->';
export const MA_WIKI_END = '<!-- END MA-WIKI -->';

export function getAgentsMdPath(): string {
  // ADR 0003：与 wiki/store 一致
  const cwd = resolveWorkspaceCwd().path;
  return resolve(cwd && cwd.length > 0 ? cwd : process.cwd(), 'AGENTS.md');
}

export function writeManagedBlock(
  path: string,
  begin: string,
  end: string,
  body: string,
): void {
  const block = `${begin}\n${body.trim()}\n${end}\n`;
  if (!existsSync(path)) {
    writeFileSync(path, block, 'utf-8');
    return;
  }
  const raw = readFileSync(path, 'utf-8');
  const bi = raw.indexOf(begin);
  if (bi < 0) {
    const sep = raw.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(path, raw + sep + block, 'utf-8');
    return;
  }
  const ei = raw.indexOf(end, bi);
  if (ei < 0) {
    // 半损坏：begin 到 EOF 替换
    writeFileSync(path, raw.slice(0, bi) + block, 'utf-8');
    return;
  }
  const after = raw.slice(ei + end.length).replace(/^\r?\n/, '');
  writeFileSync(path, raw.slice(0, bi) + block + after, 'utf-8');
}

export function readManagedBlock(path?: string): string | null {
  const p = path ?? getAgentsMdPath();
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf-8');
  const bi = raw.indexOf(MA_WIKI_BEGIN);
  if (bi < 0) return null;
  const contentStart = bi + MA_WIKI_BEGIN.length;
  const ei = raw.indexOf(MA_WIKI_END, contentStart);
  if (ei < 0) return raw.slice(contentStart).trim() || null;
  return raw.slice(contentStart, ei).trim() || null;
}

export function renderBridgeBody(
  pages: { slug: string; title: string }[],
  recentLogText: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const pageLines =
    pages.length === 0
      ? '- （暂无 wiki 页）'
      : pages.map((p) => `- [${p.title}](wiki/${p.slug}.md)`).join('\n');
  const logLines = recentLogText
    .split('\n')
    .filter((l) => l.startsWith('## ['))
    .slice(-5)
    .map((l) => `- ${l.replace(/^##\s+/, '')}`)
    .join('\n');
  return `## Project Wiki Snapshot
- Last updated: ${date}
- Pages: ${pages.length}

### Pages
${pageLines}

### Recent ingests
${logLines || '- （暂无）'}`;
}

export function updateAgentsMdBridge(): void {
  const pages = listWikiPages();
  const body = renderBridgeBody(pages, readLog());
  writeManagedBlock(getAgentsMdPath(), MA_WIKI_BEGIN, MA_WIKI_END, body);
}

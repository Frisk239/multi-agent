// S08 AGENTS.md 桥梁（spec §3，学 multica runtime_config.go marker-pair）
// DS3 / ADR 0005：project 根写 {localPath}/AGENTS.md；global 仍写 workspace/cwd
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveWorkspaceCwd } from '../workspace-cwd.js';
import { listWikiPages, readLog, resolveWikiDir, type WikiRootOpts } from './store.js';

export const MA_WIKI_BEGIN = '<!-- BEGIN MA-WIKI (auto-managed; do not edit) -->';
export const MA_WIKI_END = '<!-- END MA-WIKI -->';

export function getAgentsMdPath(): string {
  // ADR 0003：与 wiki/store 一致
  const cwd = resolveWorkspaceCwd().path;
  return resolve(cwd && cwd.length > 0 ? cwd : process.cwd(), 'AGENTS.md');
}

/** project 根：{localPath}/AGENTS.md；global：workspace/cwd AGENTS.md */
export function getAgentsMdPathForRoot(opts?: WikiRootOpts): string {
  const root = resolveWikiDir(opts);
  if (root.source === 'project' && root.projectLocalPath) {
    return resolve(root.projectLocalPath, 'AGENTS.md');
  }
  return getAgentsMdPath();
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

/**
 * 更新 AGENTS.md 的 MA-WIKI managed 块。
 * - global：workspace/cwd AGENTS.md + 全局 wiki 列表
 * - project：{localPath}/AGENTS.md + 该 project wiki 列表（ADR 0005 §4）
 */
export function updateAgentsMdBridge(opts?: WikiRootOpts): void {
  const pages = listWikiPages(opts);
  const body = renderBridgeBody(pages, readLog(opts));
  writeManagedBlock(getAgentsMdPathForRoot(opts), MA_WIKI_BEGIN, MA_WIKI_END, body);
}

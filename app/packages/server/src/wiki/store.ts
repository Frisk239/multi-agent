// S06 Wiki 存储层（spec §3）
// 文件系统 markdown 存储：wiki/ 目录（index.md + log.md + raw/ + *.md）
// 照 concepts llm-wiki-pattern.md 的 raw/wiki 三层 + index/log 导航
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// 目录定位（spec §3.6）：照 S05 scanner.ts 的 MA_WORKSPACE_CWD 模式
export function getWikiDir(): string {
  const cwd = process.env.MA_WORKSPACE_CWD;
  return resolve(cwd && cwd.length > 0 ? cwd : process.cwd(), 'wiki');
}

// 启动时确保目录 + 初始文件存在（spec §3.7 ensureWikiDir）
export function ensureWikiDir(): void {
  const wikiDir = getWikiDir();
  if (!existsSync(wikiDir)) {
    mkdirSync(wikiDir, { recursive: true });
  }
  const rawDir = join(wikiDir, 'raw');
  if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true });
  }
  // 初始 index.md（spec §3.2）
  const indexPath = join(wikiDir, 'index.md');
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, '# Wiki Index\n\n## Pages\n', 'utf-8');
  }
  // 初始 log.md（spec §3.3）
  const logPath = join(wikiDir, 'log.md');
  if (!existsSync(logPath)) {
    writeFileSync(logPath, '# Wiki Log\n', 'utf-8');
  }
}

// 列表：扫 wiki/*.md（排除 index.md/log.md）→ [{slug, title}]（spec §3.7）
// slug 不含 .md；title 从首行 `# ` 提取，无标题行用 slug 兜底
export function listWikiPages(): { slug: string; title: string }[] {
  const wikiDir = getWikiDir();
  if (!existsSync(wikiDir)) return [];
  const entries = readdirSync(wikiDir);
  const result: { slug: string; title: string }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    if (entry === 'index.md' || entry === 'log.md') continue;
    const slug = entry.slice(0, -3); // 去掉 .md
    const filePath = join(wikiDir, entry);
    const content = readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;
    result.push({ slug, title });
  }
  return result;
}

// 读单页（spec §3.7）：slug 不含 .md，内部拼扩展名
export function readWikiPage(slug: string): { slug: string; title: string; content: string } | null {
  const filePath = join(getWikiDir(), `${slug}.md`);
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf-8');
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : slug;
  return { slug, title, content };
}

// 写 wiki 页（spec §3.7）
export function writeWikiPage(slug: string, content: string): void {
  const filePath = join(getWikiDir(), `${slug}.md`);
  writeFileSync(filePath, content, 'utf-8');
}

// 追加 index 条目（spec §3.2）：读现有 index → 追加 → 重写
export function appendIndex(entry: { slug: string; title: string; identifier: string }): void {
  const indexPath = join(getWikiDir(), 'index.md');
  const date = new Date().toISOString().slice(0, 10);
  // index.md 条目格式：- [标题](slug.md) — 摘要（日期）
  // slug 在 index 里带 .md 后缀（markdown 链接标准格式）
  const line = `- [${entry.title}](${entry.slug}.md) — ${entry.identifier}（${date}）\n`;
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, '# Wiki Index\n\n## Pages\n', 'utf-8');
  }
  appendFileSync(indexPath, line, 'utf-8');
}

// 追加 log（spec §3.3）：append-only，前缀可 grep
export function appendLog(entry: {
  type: string; // 'ingest' | 'ingest-failed'
  identifier: string;
  issueId: string;
  slug?: string;
  error?: string;
}): void {
  const logPath = join(getWikiDir(), 'log.md');
  const date = new Date().toISOString().slice(0, 10);
  let block: string;
  if (entry.type === 'ingest') {
    block = `## [${date}] ingest | ${entry.identifier}\n- Source: issue/${entry.issueId}\n- Page: ${entry.slug}.md\n\n`;
  } else {
    // ingest-failed
    block = `## [${date}] ingest-failed | ${entry.identifier}\n- Source: issue/${entry.issueId}\n- Error: ${entry.error ?? 'unknown'}\n\n`;
  }
  if (!existsSync(logPath)) {
    writeFileSync(logPath, '# Wiki Log\n', 'utf-8');
  }
  appendFileSync(logPath, block, 'utf-8');
}

// 存 raw 快照（spec §3.4）：不可变，文件名含 timestamp 防覆盖
export function saveRaw(issueId: string, content: string): void {
  const rawDir = join(getWikiDir(), 'raw');
  if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = join(rawDir, `issue-${issueId}-${ts}.md`);
  writeFileSync(filePath, content, 'utf-8');
}

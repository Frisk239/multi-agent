import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => null,
        }),
      }),
    }),
  },
  sqlite: {},
}));

vi.mock('../db/schema.js', () => ({
  projects: { id: 'id', localPath: 'local_path' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('../workspace-cwd.js', () => ({
  resolveWorkspaceCwd: () => ({ path: '', configured: false, source: 'none' }),
}));

import { ensureWikiDir, writeWikiPage } from './store.js';
import { listBacklinks } from './backlinks.js';

// G4-5b：backlink 反查（引用自其他页）——真临时 wiki 目录 + 内链形态实测。
describe('G4-5b listBacklinks', () => {
  let wikiDir: string;
  let prevWikiDir: string | undefined;

  beforeEach(() => {
    wikiDir = mkdtempSync(join(tmpdir(), 'ma-wiki-backlinks-'));
    prevWikiDir = process.env.MA_WIKI_DIR;
    process.env.MA_WIKI_DIR = wikiDir;
    ensureWikiDir();
  });

  afterEach(() => {
    if (prevWikiDir === undefined) delete process.env.MA_WIKI_DIR;
    else process.env.MA_WIKI_DIR = prevWikiDir;
    rmSync(wikiDir, { recursive: true, force: true });
  });

  it('命中 [title](slug.md) 内链的页被反查；一页只计一次；自引用不计', () => {
    writeWikiPage('target', '# Target 页\n\n目标内容');
    writeWikiPage(
      'src-a',
      '# A\n\n见 [Target 页](target.md) 与 [Target 页](target.md) 重复链接，还有 [其他](other.md)。',
    );
    writeWikiPage('src-b', '# B\n\n参考 [Target 页](target.md)。');
    writeWikiPage('target-self', '# T\n\n自己链自己 [Target 页](target.md)。');

    const backlinks = listBacklinks('target');
    const froms = backlinks.map((b) => b.from).sort();
    expect(froms).toEqual(['src-a', 'src-b', 'target-self'].sort());
    // 重复链接一页只计一次
    expect(backlinks.filter((b) => b.from === 'src-a')).toHaveLength(1);
    // 带回页面标题
    expect(backlinks.find((b) => b.from === 'src-b')?.title).toBe('B');
    // 无引用的页 → 空
    expect(listBacklinks('nobody')).toEqual([]);
  });

  it('断链目标（不存在页）也照常反查（引用存在性由 health 检查负责）', () => {
    writeWikiPage('src-c', '# C\n\n链向 [Ghost](ghost.md)。');
    expect(listBacklinks('ghost').map((b) => b.from)).toEqual(['src-c']);
  });
});

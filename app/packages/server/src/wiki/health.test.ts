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
import { checkHealth } from './health.js';

describe('checkHealth contradiction scan (Slice 31 no-regression)', () => {
  let wikiDir: string;
  let prevWikiDir: string | undefined;

  beforeEach(() => {
    wikiDir = mkdtempSync(join(tmpdir(), 'ma-wiki-health-s31-'));
    prevWikiDir = process.env.MA_WIKI_DIR;
    process.env.MA_WIKI_DIR = wikiDir;
    ensureWikiDir();
  });

  afterEach(() => {
    if (prevWikiDir === undefined) delete process.env.MA_WIKI_DIR;
    else process.env.MA_WIKI_DIR = prevWikiDir;
    rmSync(wikiDir, { recursive: true, force: true });
  });

  it('flags pages with WARNING 知识冲突警告', () => {
    writeWikiPage(
      'conflict-page',
      '# Conflict\n\n> [!WARNING]\n> 知识冲突警告：A vs B\n\nbody long enough not to be stub xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n',
    );
    writeWikiPage(
      'ok-page',
      '# OK\n\nplain content long enough not stub xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n',
    );
    const h = checkHealth();
    expect(h.total).toBe(2);
    expect(h.contradictions.map((c) => c.slug)).toEqual(['conflict-page']);
  });
});

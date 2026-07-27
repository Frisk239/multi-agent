import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

import {
  appendIndex,
  appendLog,
  ensureWikiDir,
  hashWikiContent,
  readIndex,
  readIssueContentHash,
  readLog,
  writeIssueContentHash,
} from './store.js';

describe('wiki store Slice 31 (hash / index / log)', () => {
  let wikiDir: string;
  let prevWikiDir: string | undefined;

  beforeEach(() => {
    wikiDir = mkdtempSync(join(tmpdir(), 'ma-wiki-s31-'));
    prevWikiDir = process.env.MA_WIKI_DIR;
    process.env.MA_WIKI_DIR = wikiDir;
    ensureWikiDir();
  });

  afterEach(() => {
    if (prevWikiDir === undefined) delete process.env.MA_WIKI_DIR;
    else process.env.MA_WIKI_DIR = prevWikiDir;
    rmSync(wikiDir, { recursive: true, force: true });
  });

  describe('hashWikiContent + sidecar', () => {
    it('is stable for same content and changes when content changes', () => {
      const a = hashWikiContent('# FRI-01: t\n\nDescription: x');
      const b = hashWikiContent('# FRI-01: t\n\nDescription: x');
      const c = hashWikiContent('# FRI-01: t\n\nDescription: y');
      expect(a).toBe(b);
      expect(a).not.toBe(c);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it('write/read issue content hash sidecar under raw/', () => {
      const issueId = 'iss-1';
      const hash = hashWikiContent('payload');
      expect(readIssueContentHash(issueId)).toBeNull();
      writeIssueContentHash(issueId, hash);
      expect(readIssueContentHash(issueId)).toBe(hash);
      const sidecar = join(wikiDir, 'raw', `issue-${issueId}.sha256`);
      expect(existsSync(sidecar)).toBe(true);
      expect(readFileSync(sidecar, 'utf-8')).toBe(hash);
    });
  });

  describe('appendIndex idempotent', () => {
    it('does not append the same slug twice', () => {
      const entry = { slug: 'FRI-01-Title', title: 'Title', identifier: 'FRI-01' };
      expect(appendIndex(entry)).toBe(true);
      expect(appendIndex(entry)).toBe(false);
      expect(appendIndex({ ...entry, title: 'Title Renamed' })).toBe(false);
      const entries = readIndex();
      expect(entries.filter((e) => e.slug === entry.slug)).toHaveLength(1);
      const indexText = readFileSync(join(wikiDir, 'index.md'), 'utf-8');
      const occurrences = indexText.split(`(${entry.slug}.md)`).length - 1;
      expect(occurrences).toBe(1);
    });

    it('allows different slugs', () => {
      expect(appendIndex({ slug: 'a', title: 'A', identifier: 'A' })).toBe(true);
      expect(appendIndex({ slug: 'b', title: 'B', identifier: 'B' })).toBe(true);
      expect(readIndex().map((e) => e.slug).sort()).toEqual(['a', 'b']);
    });
  });

  describe('appendLog grep discipline', () => {
    it('writes skip / query-save / ingest lines that are greppable', () => {
      appendLog({
        type: 'skip',
        identifier: 'FRI-01',
        issueId: 'iss-1',
        slug: 'FRI-01-Title',
        reason: 'content-hash-unchanged',
      });
      appendLog({
        type: 'query-save',
        identifier: 'query',
        issueId: 'query',
        slug: 'query-Saved',
      });
      appendLog({
        type: 'ingest',
        identifier: 'FRI-02',
        issueId: 'iss-2',
        slug: 'FRI-02-Other',
      });
      const log = readLog();
      expect(log).toMatch(/\] skip \| FRI-01/);
      expect(log).toContain('content-hash-unchanged');
      expect(log).toMatch(/\] query-save \| query/);
      expect(log).toContain('query-Saved.md');
      expect(log).toMatch(/\] ingest \| FRI-02/);
    });
  });
});

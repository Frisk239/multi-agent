import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const issueRow = {
  id: 'iss-hash-1',
  identifier: 'FRI-31',
  title: 'Wiki Hash Skip',
  description: 'same body',
  status: 'done',
  projectId: null,
  priority: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mocks = vi.hoisted(() => ({
  generateWikiPage: vi.fn(async () => '# FRI-31 Wiki Hash Skip\n\nbody'),
  createLlm: vi.fn(() => ({})),
  buildIngestPrompt: vi.fn(() => 'prompt'),
  updateAgentsMdBridge: vi.fn(),
  publish: vi.fn(),
  issueGet: vi.fn(),
  commentsAll: vi.fn(() => []),
}));

vi.mock('../db/client.js', () => {
  const select = () => ({
    from: (table: { __name?: string }) => {
      // comments chain needs orderBy/limit/all; issues needs where/get
      return {
        where: () => ({
          get: () => mocks.issueGet(),
          orderBy: () => ({
            limit: () => ({
              all: () => mocks.commentsAll(),
            }),
          }),
        }),
      };
    },
  });
  return { db: { select }, sqlite: {} };
});

vi.mock('../db/schema.js', () => ({
  issues: { id: 'id' },
  comments: { issueId: 'issue_id', createdAt: 'created_at' },
  projects: { id: 'id', localPath: 'local_path' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  desc: vi.fn(),
}));

vi.mock('../db/reshape.js', () => ({
  toIssue: (row: typeof issueRow) => ({
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    status: row.status,
    projectId: row.projectId,
    priority: row.priority,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }),
  toComment: (r: unknown) => r,
}));

vi.mock('../workspace-cwd.js', () => ({
  resolveWorkspaceCwd: () => ({ path: '', configured: false, source: 'none' }),
}));

vi.mock('./llm.js', () => ({
  createLlm: () => mocks.createLlm(),
  buildIngestPrompt: mocks.buildIngestPrompt,
  generateWikiPage: mocks.generateWikiPage,
}));

vi.mock('./agents-bridge.js', () => ({
  updateAgentsMdBridge: mocks.updateAgentsMdBridge,
}));

vi.mock('../orchestration/event-bus.js', () => ({
  eventBus: { publish: mocks.publish },
}));

import { ingestIssue } from './ingest.js';
import { readIssueContentHash, readLog, readWikiPage } from './store.js';

describe('ingestIssue content-hash skip (Slice 31)', () => {
  let wikiDir: string;
  let prevWikiDir: string | undefined;
  let prevApiKey: string | undefined;

  beforeEach(() => {
    wikiDir = mkdtempSync(join(tmpdir(), 'ma-wiki-ingest-s31-'));
    prevWikiDir = process.env.MA_WIKI_DIR;
    prevApiKey = process.env.WIKI_LLM_API_KEY;
    process.env.MA_WIKI_DIR = wikiDir;
    process.env.WIKI_LLM_API_KEY = 'test-key';
    mocks.issueGet.mockReturnValue(issueRow);
    mocks.commentsAll.mockReturnValue([]);
    mocks.generateWikiPage.mockClear();
    mocks.createLlm.mockClear();
    mocks.updateAgentsMdBridge.mockClear();
    mocks.publish.mockClear();
  });

  afterEach(() => {
    if (prevWikiDir === undefined) delete process.env.MA_WIKI_DIR;
    else process.env.MA_WIKI_DIR = prevWikiDir;
    if (prevApiKey === undefined) delete process.env.WIKI_LLM_API_KEY;
    else process.env.WIKI_LLM_API_KEY = prevApiKey;
    rmSync(wikiDir, { recursive: true, force: true });
  });

  it('first ingest calls LLM and writes hash; second same content skips LLM', async () => {
    const first = await ingestIssue(issueRow.id);
    expect(first.skipped).toBe(false);
    expect(mocks.generateWikiPage).toHaveBeenCalledTimes(1);
    expect(readIssueContentHash(issueRow.id)).toMatch(/^[a-f0-9]{64}$/);
    const page = readWikiPage(first.slug!);
    expect(page?.content).toContain('FRI-31');

    const second = await ingestIssue(issueRow.id);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('content-hash-unchanged');
    expect(mocks.generateWikiPage).toHaveBeenCalledTimes(1); // no second LLM
    const log = readLog();
    expect(log).toMatch(/\] skip \| FRI-31/);
    expect(log).toContain('content-hash-unchanged');
  });

  it('content change re-runs LLM', async () => {
    await ingestIssue(issueRow.id);
    mocks.generateWikiPage.mockClear();
    mocks.issueGet.mockReturnValue({ ...issueRow, description: 'changed body' });
    const r = await ingestIssue(issueRow.id);
    expect(r.skipped).toBe(false);
    expect(mocks.generateWikiPage).toHaveBeenCalledTimes(1);
  });
});

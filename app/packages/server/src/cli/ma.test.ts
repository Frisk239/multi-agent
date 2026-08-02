import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * B2 · CLI → server 请求统一转发 MA_LOCAL_TOKEN（Authorization: Bearer）。
 * mock envelope（emitOk/emitErr 不再 process.exit）与全局 fetch，直接调用 handleIssueCreate。
 */

// ma.ts 传递依赖 db/client —— 导入前先指向内存库，避免测试写 ./dev.db
vi.hoisted(() => {
  process.env.DB_PATH = ':memory:';
});

const { emitOk, emitErr } = vi.hoisted(() => ({
  emitOk: vi.fn(),
  emitErr: vi.fn(),
}));

vi.mock('./envelope.js', () => ({
  emitOk,
  emitErr,
}));

import { handleIssueCreate } from './ma.js';

function fakeResponse(overrides: { ok: boolean; status: number; text: string }) {
  return {
    ok: overrides.ok,
    status: overrides.status,
    text: async () => overrides.text,
  } as Response;
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function issueCreateArgs(): string[] {
  return [
    'issue',
    'create',
    '--title',
    'CLI 建卡',
    '--assignee-type',
    'agent',
    '--assignee-id',
    'agt-lead',
    '--origin-run',
    'run-123',
  ];
}

describe('CLI issue create 转发 local token (B2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MA_LOCAL_TOKEN;
    delete process.env.MA_RUN_ID;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('配置 MA_LOCAL_TOKEN 时请求带 Authorization: Bearer', async () => {
    process.env.MA_LOCAL_TOKEN = 'secret-token-1';
    fetchMock.mockResolvedValue(
      fakeResponse({ ok: true, status: 201, text: JSON.stringify({ id: 'iss-1', identifier: 'FRI-9' }) }),
    );

    await handleIssueCreate(issueCreateArgs(), false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret-token-1');
    expect(headers['content-type']).toBe('application/json');
    expect(emitOk).toHaveBeenCalled();
  });

  it('未配置 MA_LOCAL_TOKEN 时不带 authorization 头', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ ok: true, status: 201, text: JSON.stringify({ id: 'iss-2' }) }),
    );

    await handleIssueCreate(issueCreateArgs(), false);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it('token 为空白串时不带 authorization 头', async () => {
    process.env.MA_LOCAL_TOKEN = '   ';
    fetchMock.mockResolvedValue(
      fakeResponse({ ok: true, status: 201, text: JSON.stringify({ id: 'iss-3' }) }),
    );

    await handleIssueCreate(issueCreateArgs(), false);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it('请求失败时仍带 token 并 emitErr', async () => {
    process.env.MA_LOCAL_TOKEN = 'secret-token-2';
    fetchMock.mockResolvedValue(
      fakeResponse({ ok: false, status: 401, text: JSON.stringify({ error: 'unauthorized' }) }),
    );

    await handleIssueCreate(issueCreateArgs(), false);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret-token-2');
    expect(emitErr).toHaveBeenCalled();
    // 注：真实 emitErr 会 process.exit；mock 不中断，后续 emitOk 属 mock 假象，不在此断言
  });
});

describe('G4-5 wiki query --roots flag', () => {
  const queryWikiMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    queryWikiMock.mockReset();
    queryWikiMock.mockResolvedValue({ answer: '答案', citations: [] });
    vi.doMock('../wiki/query.js', () => ({
      queryWiki: queryWikiMock,
    }));
    vi.doMock('../wiki/store.js', () => ({
      ensureWikiDir: vi.fn(),
      listWikiPages: vi.fn(() => []),
    }));
    vi.doMock('../wiki/health.js', () => ({ checkHealth: vi.fn() }));
    vi.doMock('../wiki/lint.js', () => ({ checkLint: vi.fn() }));
    vi.doMock('../wiki/ingest-queue.js', () => ({
      enqueueWikiIngest: vi.fn(),
      retryWikiIngestJob: vi.fn(),
      listWikiIngestJobs: vi.fn(() => []),
    }));
    vi.doMock('../wiki/ingest.js', () => ({ ingestIssue: vi.fn() }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  const savedArgv = process.argv;

  function setArgv(rest: string[]) {
    process.argv = ['node', 'ma.ts', ...rest];
  }

  it('--roots 传跨根检索选项', async () => {
    const { main } = await import('./ma.js');
    setArgv(['wiki', 'query', '什么是 Wiki', '--roots']);
    await main();
    expect(queryWikiMock).toHaveBeenCalledWith(
      '什么是 Wiki',
      {},
      { roots: 'all' },
    );
  });

  it('--roots=all 等价；不带 flag 保持单根行为', async () => {
    const { main } = await import('./ma.js');
    setArgv(['wiki', 'query', '什么是 Wiki', '--roots=all']);
    await main();
    expect(queryWikiMock).toHaveBeenCalledWith(
      '什么是 Wiki',
      {},
      { roots: 'all' },
    );

    queryWikiMock.mockClear();
    setArgv(['wiki', 'query', '什么是 Wiki']);
    await main();
    expect(queryWikiMock).toHaveBeenCalledWith('什么是 Wiki', {}, undefined);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryManager } from './manager.js';
import type { MemoryItemView, MemoryProvider, MemorySyncInput } from './types.js';

type AddRawFn = (
  text: string,
  meta?: { issueId?: string | null; agentId?: string | null; runId?: string | null },
) => MemoryItemView | Promise<MemoryItemView>;

type MockProvider = MemoryProvider & {
  addRaw?: AddRawFn;
};

function makeProvider(overrides: Partial<MockProvider> = {}): MockProvider {
  const addRaw = vi.fn(
    async (
      text: string,
      meta?: { issueId?: string | null; agentId?: string | null; runId?: string | null },
    ): Promise<MemoryItemView> => ({
      id: `m-${Math.random().toString(36).slice(2, 8)}`,
      text,
      issueId: meta?.issueId ?? null,
      runId: meta?.runId ?? null,
      createdAt: new Date().toISOString(),
    }),
  );

  return {
    name: 'mock',
    isAvailable: () => true,
    initialize: () => undefined,
    prefetch: async () => ({ items: [] }),
    prefetchSync: () => ({ items: [] }),
    syncTurn: vi.fn(async (_input: MemorySyncInput) => undefined),
    addRaw,
    ...overrides,
  };
}

describe('MemoryManager (Slice 24: serial write + circuit breaker)', () => {
  let mgr: MemoryManager;
  const envKeys = [
    'MA_MEMORY_BREAKER_THRESHOLD',
    'MA_MEMORY_BREAKER_COOLDOWN_MS',
    'MA_MEMORY_AUTO_INJECT',
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    mgr = new MemoryManager();
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('serializes concurrent writes (concurrency=1)', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;

    const provider = makeProvider({
      syncTurn: vi.fn(async (input: MemorySyncInput) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(`start:${input.runId}`);
        await new Promise((r) => setTimeout(r, 30));
        order.push(`end:${input.runId}`);
        active -= 1;
      }),
    });
    // remove addRaw so syncRunCompleted uses syncTurn path only
    delete (provider as { addRaw?: unknown }).addRaw;
    mgr.setExternal(provider);

    mgr.syncRunCompleted({
      issue: { id: 'i1', identifier: 'MA-1', title: 't1', description: null },
      run: { id: 'r1', agentId: 'a1', status: 'completed' },
      assistantText: 'out1',
    });
    mgr.syncRunCompleted({
      issue: { id: 'i2', identifier: 'MA-2', title: 't2', description: null },
      run: { id: 'r2', agentId: 'a1', status: 'completed' },
      assistantText: 'out2',
    });
    mgr.syncRunCompleted({
      issue: { id: 'i3', identifier: 'MA-3', title: 't3', description: null },
      run: { id: 'r3', agentId: 'a1', status: 'completed' },
      assistantText: 'out3',
    });

    // wait for write chain to drain
    await new Promise((r) => setTimeout(r, 200));

    expect(maxActive).toBe(1);
    expect(order).toEqual([
      'start:r1',
      'end:r1',
      'start:r2',
      'end:r2',
      'start:r3',
      'end:r3',
    ]);
    expect(provider.syncTurn).toHaveBeenCalledTimes(3);
  });

  it('opens circuit after consecutive write failures', async () => {
    process.env.MA_MEMORY_BREAKER_THRESHOLD = '3';
    process.env.MA_MEMORY_BREAKER_COOLDOWN_MS = '60000';

    const provider = makeProvider({
      addRaw: vi.fn(async () => {
        throw new Error('write boom');
      }),
    });
    mgr.setExternal(provider);

    for (let i = 0; i < 3; i++) {
      await expect(mgr.addCurated(`fail-${i}`)).rejects.toThrow('write boom');
    }

    const st = mgr.getStatus();
    expect(st.breakerOpen).toBe(true);
    expect(st.breakerFailures).toBe(3);
    expect(st.breakerOpenUntil).not.toBeNull();
  });

  it('skips writes and prefetch while breaker is open (cooldown)', async () => {
    process.env.MA_MEMORY_BREAKER_THRESHOLD = '2';
    process.env.MA_MEMORY_BREAKER_COOLDOWN_MS = '120000';

    const addRaw = vi.fn(async () => {
      throw new Error('down');
    });
    const prefetch = vi.fn(async () => ({
      items: [{ id: 'x', text: 'should-not-inject' }],
    }));
    const provider = makeProvider({ addRaw, prefetch });
    mgr.setExternal(provider);

    await expect(mgr.addCurated('a')).rejects.toThrow('down');
    await expect(mgr.addCurated('b')).rejects.toThrow('down');
    expect(mgr.getStatus().breakerOpen).toBe(true);

    const callsBefore = addRaw.mock.calls.length;

    // addCurated throws immediately / queue write path
    await expect(mgr.addCurated('c')).rejects.toThrow(/circuit breaker open/);

    mgr.ambientCapture({ kind: 'comment', issueId: 'i1', text: 'ambient' });
    mgr.syncRunCompleted({
      issue: { id: 'i1', identifier: 'MA-1', title: 't', description: null },
      run: { id: 'r1', agentId: 'a1', status: 'completed' },
      assistantText: 'out',
    });
    await new Promise((r) => setTimeout(r, 20));

    // no additional provider writes during open
    expect(addRaw.mock.calls.length).toBe(callsBefore);

    const block = await mgr.prefetchForIssue({
      id: 'i1',
      title: 'hello',
      description: 'world',
    });
    expect(block).toBeNull();
    expect(prefetch).not.toHaveBeenCalled();

    const syncBlock = mgr.prefetchForIssueSync({
      id: 'i1',
      title: 'hello',
      description: 'world',
    });
    expect(syncBlock).toBeNull();
  });

  it('closes breaker after success once cooldown elapsed (probe)', async () => {
    vi.useFakeTimers();
    process.env.MA_MEMORY_BREAKER_THRESHOLD = '2';
    process.env.MA_MEMORY_BREAKER_COOLDOWN_MS = '5000';

    let fail = true;
    const addRaw = vi.fn(async (text: string): Promise<MemoryItemView> => {
      if (fail) throw new Error('temp fail');
      return {
        id: 'ok',
        text,
        createdAt: new Date().toISOString(),
      };
    });
    const provider = makeProvider({ addRaw });
    mgr.setExternal(provider);

    await expect(mgr.addCurated('1')).rejects.toThrow('temp fail');
    await expect(mgr.addCurated('2')).rejects.toThrow('temp fail');
    expect(mgr.getStatus().breakerOpen).toBe(true);

    // still in cooldown → blocked
    await expect(mgr.addCurated('probe-early')).rejects.toThrow(/circuit breaker open/);
    expect(addRaw).toHaveBeenCalledTimes(2);

    // cooldown ends → allow probe write
    fail = false;
    await vi.advanceTimersByTimeAsync(5001);

    expect(mgr.isBreakerOpen()).toBe(false);
    const created = await mgr.addCurated('probe-ok');
    expect(created).toMatchObject({ id: 'ok', text: 'probe-ok' });
    expect(mgr.getStatus().breakerOpen).toBe(false);
    expect(mgr.getStatus().breakerFailures).toBe(0);
    expect(mgr.getStatus().breakerOpenUntil).toBeNull();
  });

  it('getStatus reflects breaker fields', () => {
    const provider = makeProvider();
    mgr.setExternal(provider);
    const closed = mgr.getStatus();
    expect(closed).toMatchObject({
      provider: 'mock',
      available: true,
      backend: 'none',
      perProject: true,
      breakerOpen: false,
      breakerFailures: 0,
      breakerOpenUntil: null,
    });
  });

  it('G1-5 markFallback: 默认未降级；标记后 degraded + note 透出，幂等只记第一条', () => {
    const provider = makeProvider({ name: 'sqlite-text' });
    mgr.setExternal(provider);

    const clean = mgr.getStatus();
    expect(clean.degraded).toBe(false);
    expect(clean.degradedNote).toBeUndefined();

    mgr.markFallback('pgvector 初始化失败：conn refused');
    const degraded = mgr.getStatus();
    expect(degraded.degraded).toBe(true);
    expect(degraded.degradedNote).toBe('pgvector 初始化失败：conn refused');

    // 幂等：再次标记不覆盖首条原因
    mgr.markFallback('pgvector 初始化失败：timeout');
    expect(mgr.getStatus().degradedNote).toBe('pgvector 初始化失败：conn refused');
    expect(mgr.getStatus().degraded).toBe(true);
  });

  it('mixes ambientCapture + addCurated on the same serial queue', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;

    const provider = makeProvider({
      addRaw: vi.fn(async (text: string): Promise<MemoryItemView> => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(`start:${text}`);
        await new Promise((r) => setTimeout(r, 25));
        order.push(`end:${text}`);
        active -= 1;
        return {
          id: text,
          text,
          createdAt: new Date().toISOString(),
        };
      }),
    });
    mgr.setExternal(provider);

    mgr.ambientCapture({ kind: 'comment', issueId: 'i1', text: 'ambient-1' });
    const curatedP = mgr.addCurated('curated-1');
    mgr.ambientCapture({ kind: 'issue_done', issueId: 'i1', text: 'ambient-2' });

    await curatedP;
    await new Promise((r) => setTimeout(r, 150));

    expect(maxActive).toBe(1);
    expect(order).toEqual([
      'start:ambient-1',
      'end:ambient-1',
      'start:curated-1',
      'end:curated-1',
      'start:ambient-2',
      'end:ambient-2',
    ]);
  });

  it('G4-4 scope 标签：ambient=issue、curated 透传/缺省、run 完成=run', async () => {
    const addRaw = vi.fn(
      async (
        _text: string,
        meta?: {
          issueId?: string | null;
          agentId?: string | null;
          runId?: string | null;
          scope?: string | null;
        },
      ): Promise<MemoryItemView> => ({
        id: 'x',
        text: _text,
        scope: meta?.scope ?? 'workspace',
        createdAt: new Date().toISOString(),
      }),
    );
    const syncTurn = vi.fn(async (_input: MemorySyncInput) => undefined);
    const provider = makeProvider({ addRaw, syncTurn });
    mgr.setExternal(provider);

    mgr.ambientCapture({ kind: 'comment', issueId: 'i1', text: 'ambient' });
    await mgr.addCurated('curated-no-scope'); // 无 issue → workspace
    await mgr.addCurated('curated-issue', 'i1'); // 有 issue → issue
    await mgr.addCurated('curated-run', undefined, 'run'); // 显式 → run
    mgr.syncRunCompleted({
      issue: { id: 'i1', identifier: 'MA-1', title: 't', description: null },
      run: { id: 'r1', agentId: 'a1', status: 'completed' },
      assistantText: 'out',
    });
    await new Promise((r) => setTimeout(r, 50));

    const scopes = addRaw.mock.calls.map((c) => (c[1] as { scope?: string | null })?.scope);
    expect(scopes).toEqual(['issue', 'workspace', 'issue', 'run']);
    // syncRunCompleted → syncTurn 带 run scope
    expect(syncTurn).toHaveBeenCalledTimes(1);
    expect((syncTurn.mock.calls[0][0] as MemorySyncInput).scope).toBe('run');
  });
});

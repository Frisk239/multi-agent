import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./db/client.js', () => {
  const emptyAll = () => [];
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    all: emptyAll,
    get: () => undefined,
  };
  return {
    db: {
      select: () => chain,
    },
    sqlite: {
      prepare: () => ({ get: () => ({ '1': 1 }) }),
    },
  };
});

vi.mock('./memory/manager.js', () => ({
  memoryManager: {
    getStatus: () => ({
      provider: 'sqlite-text',
      available: true,
      backend: 'sqlite',
      perProject: false,
      note: 'test',
      breakerOpen: false,
      breakerFailures: 0,
      breakerOpenUntil: null,
    }),
  },
}));

import {
  buildOpsSnapshot,
  summarizeAgesMs,
} from './ops-snapshot.js';
import {
  __resetProcessHealthForTests,
  buildProcessHealth,
  markWorkerStarted,
  noteWorkerTick,
} from './process-health.js';

describe('ops snapshot', () => {
  beforeEach(() => {
    __resetProcessHealthForTests();
  });

  it('summarizeAgesMs returns p50/p95/max/avg', () => {
    const s = summarizeAgesMs([10, 20, 30, 40, 100]);
    expect(s.count).toBe(5);
    expect(s.maxMs).toBe(100);
    expect(s.avgMs).toBe(40);
    expect(s.p50Ms).toBe(30);
    expect(s.p95Ms).toBeGreaterThanOrEqual(40);
  });

  it('summarizeAgesMs empty → null ages', () => {
    expect(summarizeAgesMs([])).toEqual({
      count: 0,
      maxMs: null,
      avgMs: null,
      p50Ms: null,
      p95Ms: null,
    });
  });

  it('buildOpsSnapshot shape includes runs/wiki/memory/workers/automation', () => {
    const now = 50_000;
    for (const key of [
      'runWorker',
      'automationWorker',
      'wikiIngestWorker',
      'staleRunSweeper',
    ] as const) {
      markWorkerStarted(key, now);
      noteWorkerTick(key, now);
    }
    const processHealth = buildProcessHealth({
      now,
      db: { ok: true, latencyMs: 1 },
    });
    const snap = buildOpsSnapshot({ now, processHealth });

    expect(snap.ts).toBe(now);
    expect(snap.status === 'ok' || snap.status === 'degraded').toBe(true);
    expect(snap.runs.active).toMatchObject({
      total: expect.any(Number),
      queued: expect.any(Number),
      running: expect.any(Number),
      waitingLocalDirectory: expect.any(Number),
    });
    expect(snap.runs.queueAge).toMatchObject({
      count: expect.any(Number),
      maxMs: null,
      p50Ms: null,
      p95Ms: null,
    });
    expect(snap.wiki).toMatchObject({
      dead: expect.any(Number),
      pending: expect.any(Number),
      running: expect.any(Number),
    });
    expect(snap.memory).toMatchObject({
      breakerOpen: false,
      breakerFailures: 0,
      available: true,
    });
    expect(snap.workers.runWorker).toMatchObject({
      running: true,
      lastTickAt: now,
    });
    expect(snap.process.db.ok).toBe(true);
    expect(snap.automation).toMatchObject({
      lastError: null,
      failedRules: expect.any(Number),
    });
  });
});

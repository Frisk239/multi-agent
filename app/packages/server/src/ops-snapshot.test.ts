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
    getSqliteHardeningInfo: () => ({
      path: './dev.db',
      busyTimeoutMs: 5000,
      journalMode: 'wal',
      foreignKeys: true,
    }),
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
  accumulateOpsQueueMetrics,
  buildOpsResumeStats,
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
      retryBackoff: expect.any(Number),
    });
    expect(snap.runs.queueAge).toMatchObject({
      count: expect.any(Number),
      maxMs: null,
      p50Ms: null,
      p95Ms: null,
    });
    expect(snap.runs.eligibleQueueAge).toMatchObject({
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
    expect(snap.sqlite).toMatchObject({
      path: './dev.db',
      busyTimeoutMs: 5000,
      journalMode: 'wal',
      foreignKeys: true,
    });
    // Slice 69：resumeStats 必有键；空 mock 库全 0 + window 7d
    expect(snap.resumeStats).toMatchObject({
      sessionPoisoned: 0,
      resumeMiss: 0,
      deferredUnclaimed: 0,
      window: '7d',
    });
  });

  it('buildOpsResumeStats returns 7d window keys', () => {
    const stats = buildOpsResumeStats(Date.now());
    expect(stats).toEqual({
      sessionPoisoned: 0,
      resumeMiss: 0,
      deferredUnclaimed: 0,
      window: '7d',
    });
  });

  it('accumulateOpsQueueMetrics excludes retry_backoff from eligibleQueueAge', () => {
    const now = 100_000;
    const metrics = accumulateOpsQueueMetrics(
      [
        {
          id: 'run-ready',
          issueId: 'iss-1',
          agentId: 'ag-1',
          status: 'queued',
          createdAt: 40_000,
          nextAttemptAt: null,
        },
        {
          id: 'run-backoff',
          issueId: 'iss-2',
          agentId: 'ag-1',
          status: 'queued',
          createdAt: 10_000,
          // still waiting for nextAttemptAt → not work-eligible
          nextAttemptAt: 150_000,
        },
        {
          id: 'run-waiting',
          issueId: 'iss-3',
          agentId: 'ag-2',
          status: 'waiting_local_directory',
          createdAt: 50_000,
          waitingLocalEnteredAt: 80_000,
          nextAttemptAt: null,
        },
        {
          id: 'run-running',
          issueId: 'iss-4',
          agentId: 'ag-2',
          status: 'running',
          createdAt: 90_000,
          startedAt: 95_000,
          lastHeartbeatAt: 98_000,
        },
      ],
      now,
    );

    expect(metrics.queued).toBe(2);
    expect(metrics.waitingLocalDirectory).toBe(1);
    expect(metrics.running).toBe(1);
    expect(metrics.retryBackoff).toBe(1);
    // wall-clock ages: ready 60s, backoff 90s, waiting 20s
    expect(metrics.queueAges).toEqual([60_000, 90_000, 20_000]);
    // eligible excludes backoff row
    expect(metrics.eligibleQueueAges).toEqual([60_000, 20_000]);
    expect(metrics.hbAges).toEqual([2_000]);

    const backoffSample = metrics.queueSamples.find((s) => s.id === 'run-backoff');
    expect(backoffSample).toMatchObject({
      blockedReason: 'retry_backoff',
      eligibleAt: 150_000,
      ageMs: 90_000,
    });
    const readySample = metrics.queueSamples.find((s) => s.id === 'run-ready');
    expect(readySample).toMatchObject({
      blockedReason: null,
      eligibleAt: null,
      ageMs: 60_000,
    });

    // Pre-fix behavior would treat backoff max (90s) as at-risk; eligible max is 60s.
    expect(summarizeAgesMs(metrics.queueAges).maxMs).toBe(90_000);
    expect(summarizeAgesMs(metrics.eligibleQueueAges).maxMs).toBe(60_000);
  });

  it('accumulateOpsQueueMetrics attaches path-lock holder on waiting samples', () => {
    const now = 100_000;
    const metrics = accumulateOpsQueueMetrics(
      [
        {
          id: 'run-holder',
          issueId: 'iss-h',
          agentId: 'ag-1',
          status: 'running',
          createdAt: 90_000,
          startedAt: 91_000,
          lastHeartbeatAt: 99_000,
          cwdMode: 'project_local',
          cwdPath: 'D:\\repo\\app',
        },
        {
          id: 'run-waiting',
          issueId: 'iss-w',
          agentId: 'ag-2',
          status: 'waiting_local_directory',
          createdAt: 50_000,
          waitingLocalEnteredAt: 80_000,
          cwdMode: 'project_local',
          // same path key after normalize (slash + lower)
          cwdPath: 'd:/repo/app',
        },
        {
          id: 'run-other-path',
          issueId: 'iss-o',
          agentId: 'ag-3',
          status: 'waiting_local_directory',
          createdAt: 60_000,
          waitingLocalEnteredAt: 85_000,
          cwdMode: 'project_local',
          cwdPath: 'D:\\other\\proj',
        },
      ],
      now,
    );

    const waiting = metrics.queueSamples.find((s) => s.id === 'run-waiting');
    expect(waiting).toMatchObject({
      pathWaitReason: 'path_busy',
      pathBlockedByRunId: 'run-holder',
      cwdPath: 'd:/repo/app',
    });
    const free = metrics.queueSamples.find((s) => s.id === 'run-other-path');
    expect(free).toMatchObject({
      pathWaitReason: null,
      pathBlockedByRunId: null,
    });
  });
});

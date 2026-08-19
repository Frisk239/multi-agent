import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  __resetProcessHealthForTests,
  buildProcessHealth,
  invokeWorkerTickSafely,
  markWorkerStarted,
  markWorkerStopped,
  noteWorkerFailure,
  noteWorkerTick,
  trackWorkerTick,
  WORKER_FAILURE_SUMMARY_MAX_CHARS,
  WORKER_STALE_MS,
} from './process-health.js';

const workerKeys = [
  'runWorker',
  'automationWorker',
  'wikiIngestWorker',
  'staleRunSweeper',
] as const;

function startAndTickAll(at: number): void {
  for (const key of workerKeys) {
    markWorkerStarted(key);
    noteWorkerTick(key, at);
  }
}

describe('buildProcessHealth', () => {
  beforeEach(() => {
    __resetProcessHealthForTests();
  });

  it('is degraded when workers not started', () => {
    const h = buildProcessHealth({
      now: 1_000,
      db: { ok: true, latencyMs: 1 },
    });
    expect(h.status).toBe('degraded');
    expect(h.db.ok).toBe(true);
    expect(h.workers.runWorker.running).toBe(false);
    expect(h.workers.runWorker.lastTickAt).toBeNull();
  });

  it('is ok when all workers recently ticked and db ok', () => {
    const now = 10_000;
    for (const key of workerKeys) {
      markWorkerStarted(key, now - 100);
      noteWorkerTick(key, now - 50);
    }
    const h = buildProcessHealth({
      now,
      db: { ok: true, latencyMs: 2 },
    });
    expect(h.status).toBe('ok');
    expect(h.workers.runWorker.ageMs).toBe(50);
    expect(h.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(h.ts).toBe(now);
  });

  it('is degraded when db fails', () => {
    const now = 5_000;
    startAndTickAll(now);
    const h = buildProcessHealth({
      now,
      db: { ok: false, latencyMs: 3, error: 'disk full' },
    });
    expect(h.status).toBe('degraded');
    expect(h.db.error).toBe('disk full');
  });

  it('is degraded when a running worker is stale', () => {
    const now = 100_000;
    markWorkerStarted('runWorker', now - WORKER_STALE_MS.runWorker - 1_000);
    noteWorkerTick('runWorker', now - WORKER_STALE_MS.runWorker - 1_000);
    markWorkerStarted('automationWorker', now);
    noteWorkerTick('automationWorker', now);
    markWorkerStarted('wikiIngestWorker', now);
    noteWorkerTick('wikiIngestWorker', now);
    markWorkerStarted('staleRunSweeper', now);
    noteWorkerTick('staleRunSweeper', now);

    const h = buildProcessHealth({ now, db: { ok: true, latencyMs: 0 } });
    expect(h.status).toBe('degraded');
    expect(h.workers.runWorker.ageMs).toBeGreaterThan(WORKER_STALE_MS.runWorker);
  });

  it('marks stopped worker as not running', () => {
    markWorkerStarted('runWorker', 1);
    markWorkerStopped('runWorker');
    expect(buildProcessHealth({ now: 2, db: { ok: true, latencyMs: 0 } }).workers.runWorker.running).toBe(
      false,
    );
  });

  it('does not fabricate a successful heartbeat when a worker merely starts', () => {
    for (const key of workerKeys) markWorkerStarted(key, 1);
    const h = buildProcessHealth({ now: 2, db: { ok: true, latencyMs: 0 } });

    expect(h.status).toBe('ok');
    expect(h.workers.runWorker).toMatchObject({
      running: true,
      lastTickAt: null,
      ageMs: null,
      consecutiveFailures: 0,
      lastFailureAt: null,
      lastFailureSummary: null,
    });
  });

  it('turns a top-level tick failure into degraded metadata, then clears it on success', async () => {
    vi.useFakeTimers();
    try {
      startAndTickAll(100);
      vi.setSystemTime(150);

      await expect(
        trackWorkerTick('runWorker', () => {
          throw new Error('sqlite locked token=super-secret-value');
        }),
      ).rejects.toThrow('sqlite locked');
      await expect(
        trackWorkerTick('runWorker', () => Promise.reject(new Error('sqlite still locked'))),
      ).rejects.toThrow('sqlite still locked');

      const degraded = buildProcessHealth({ now: 151, db: { ok: true, latencyMs: 0 } });
      expect(degraded.status).toBe('degraded');
      expect(degraded.workers.runWorker).toMatchObject({
        lastTickAt: 100,
        ageMs: 51,
        consecutiveFailures: 2,
        lastFailureAt: 150,
        lastFailureSummary: 'sqlite still locked',
      });

      vi.setSystemTime(200);
      await trackWorkerTick('runWorker', () => undefined);
      const recovered = buildProcessHealth({ now: 201, db: { ok: true, latencyMs: 0 } });
      expect(recovered.status).toBe('ok');
      expect(recovered.workers.runWorker).toMatchObject({
        lastTickAt: 200,
        ageMs: 1,
        consecutiveFailures: 0,
        lastFailureAt: null,
        lastFailureSummary: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the same failure/recovery semantics for all worker keys', async () => {
    for (const key of workerKeys) {
      __resetProcessHealthForTests();
      startAndTickAll(100);
      await expect(trackWorkerTick(key, () => Promise.reject(new Error(`${key} top-level failure`)))).rejects.toThrow(
        'top-level failure',
      );

      const failed = buildProcessHealth({ now: 101, db: { ok: true, latencyMs: 0 } });
      expect(failed.status).toBe('degraded');
      expect(failed.workers[key].consecutiveFailures).toBe(1);
      expect(failed.workers[key].lastFailureSummary).toBe(`${key} top-level failure`);

      await trackWorkerTick(key, () => undefined);
      const recovered = buildProcessHealth({ now: 102, db: { ok: true, latencyMs: 0 } });
      expect(recovered.status).toBe('ok');
      expect(recovered.workers[key].consecutiveFailures).toBe(0);
    }
  });

  it('caps and scrubs the API failure summary while logger callers retain the source error', () => {
    const rawSecret = 'test-worker-secret-1234567890';
    noteWorkerFailure('runWorker', `token=${rawSecret} ${'x'.repeat(WORKER_FAILURE_SUMMARY_MAX_CHARS + 20)}`, 123);
    const worker = buildProcessHealth({ now: 124, db: { ok: true, latencyMs: 0 } }).workers.runWorker;

    expect(worker.lastFailureSummary).not.toContain(rawSecret);
    expect(worker.lastFailureSummary?.length).toBeLessThanOrEqual(WORKER_FAILURE_SUMMARY_MAX_CHARS + 1);
    expect(worker.lastFailureSummary).toMatch(/…$/);
  });

  it('safe wrapper catches a rejected timer/wake operation instead of leaving a rejection', async () => {
    const report = vi.fn();
    invokeWorkerTickSafely(() => Promise.reject(new Error('timer rejection')), report);

    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });
    expect(report.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('passes through treeKilled when provided (Slice 75)', () => {
    const h = buildProcessHealth({
      now: 1_000,
      db: { ok: true, latencyMs: 1 },
      treeKilled: 3,
    });
    expect(h.treeKilled).toBe(3);
  });
});

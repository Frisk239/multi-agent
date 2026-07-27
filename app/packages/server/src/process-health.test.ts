import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetProcessHealthForTests,
  buildProcessHealth,
  markWorkerStarted,
  markWorkerStopped,
  noteWorkerTick,
  WORKER_STALE_MS,
} from './process-health.js';

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
    for (const key of [
      'runWorker',
      'automationWorker',
      'wikiIngestWorker',
      'staleRunSweeper',
    ] as const) {
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
    for (const key of [
      'runWorker',
      'automationWorker',
      'wikiIngestWorker',
      'staleRunSweeper',
    ] as const) {
      markWorkerStarted(key, now);
      noteWorkerTick(key, now);
    }
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
});

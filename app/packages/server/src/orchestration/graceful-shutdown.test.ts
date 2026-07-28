import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cancelAllActiveRuns,
  shutdownServer,
  DEFAULT_SHUTDOWN_GRACE_MS,
  getLastShutdownSnapshot,
  __resetLastShutdownForTests,
} from './graceful-shutdown';

describe('graceful-shutdown', () => {
  beforeEach(() => {
    vi.useRealTimers();
    __resetLastShutdownForTests();
  });

  it('cancelAllActiveRuns: cancel DB ACTIVE → abort residual → empty', async () => {
    const order: string[] = [];
    let active = ['mem-residual'];

    const deps = {
      listDbActiveRunIds: vi.fn(() => {
        order.push('listDb');
        return ['db-1', 'db-2'];
      }),
      cancelRunsMany: vi.fn((ids: string[]) => {
        order.push(`cancel:${ids.join(',')}`);
        return { cancelled: ids.length };
      }),
      listActiveRunIds: vi.fn(() => {
        order.push(`listActive:${active.join('|') || 'empty'}`);
        return [...active];
      }),
      abortRun: vi.fn((id: string) => {
        order.push(`abort:${id}`);
        active = active.filter((x) => x !== id);
        return true;
      }),
      sleep: vi.fn(async () => {
        order.push('sleep');
      }),
      now: vi.fn(() => 0),
    };

    const report = await cancelAllActiveRuns({ graceMs: 1000, pollMs: 10, deps });

    expect(report.cancelled).toBe(2);
    expect(report.abortedResidual).toBe(1);
    expect(report.stillActive).toEqual([]);
    expect(report.timedOut).toBe(false);
    expect(order.slice(0, 5)).toEqual([
      'listDb',
      'cancel:db-1,db-2',
      'listActive:mem-residual',
      'abort:mem-residual',
      'listActive:empty',
    ]);
    expect(deps.cancelRunsMany).toHaveBeenCalledWith(['db-1', 'db-2']);
    expect(deps.abortRun).toHaveBeenCalledWith('mem-residual');
  });

  it('cancelAllActiveRuns: grace timeout leaves stillActive and timedOut', async () => {
    let t = 0;
    const deps = {
      listDbActiveRunIds: vi.fn(() => ['r1']),
      cancelRunsMany: vi.fn(() => ({ cancelled: 1 })),
      // cancel already abort'ed, but controller still appears until child dies — stick around
      listActiveRunIds: vi.fn(() => ['r1']),
      abortRun: vi.fn(() => false),
      sleep: vi.fn(async (ms: number) => {
        t += ms;
      }),
      now: vi.fn(() => t),
    };

    const report = await cancelAllActiveRuns({ graceMs: 100, pollMs: 40, deps });

    expect(report.cancelled).toBe(1);
    expect(report.timedOut).toBe(true);
    expect(report.stillActive).toEqual(['r1']);
    expect(deps.sleep).toHaveBeenCalled();
    expect(t).toBeGreaterThanOrEqual(100);
  });

  it('shutdownServer: stopWorkers before cancelAllActiveRuns', async () => {
    const order: string[] = [];
    const deps = {
      stopWorkers: vi.fn(() => {
        order.push('stopWorkers');
      }),
      listDbActiveRunIds: vi.fn(() => {
        order.push('listDb');
        return [];
      }),
      cancelRunsMany: vi.fn(() => ({ cancelled: 0 })),
      listActiveRunIds: vi.fn(() => {
        order.push('listActive');
        return [];
      }),
      abortRun: vi.fn(() => false),
      sleep: vi.fn(async () => undefined),
      now: vi.fn(() => 0),
      walCheckpoint: vi.fn(() => {
        order.push('walCheckpoint');
      }),
    };

    const report = await shutdownServer({ graceMs: 50, deps });

    expect(report.workersStopped).toBe(true);
    expect(report.cancelled).toBe(0);
    expect(report.timedOut).toBe(false);
    expect(report.walCheckpointOk).toBe(true);
    expect(order[0]).toBe('stopWorkers');
    expect(order).toContain('listDb');
    expect(order).toContain('walCheckpoint');
    expect(deps.stopWorkers).toHaveBeenCalledTimes(1);
    expect(deps.walCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('shutdownServer: walCheckpoint=false skips checkpoint', async () => {
    const walCheckpoint = vi.fn();
    const report = await shutdownServer({
      graceMs: 50,
      walCheckpoint: false,
      deps: {
        stopWorkers: vi.fn(),
        listDbActiveRunIds: vi.fn(() => []),
        cancelRunsMany: vi.fn(() => ({ cancelled: 0 })),
        listActiveRunIds: vi.fn(() => []),
        abortRun: vi.fn(() => false),
        sleep: vi.fn(async () => undefined),
        now: vi.fn(() => 0),
        walCheckpoint,
      },
    });
    expect(report.walCheckpointOk).toBeNull();
    expect(walCheckpoint).not.toHaveBeenCalled();
  });

  it('exports a sensible default grace window', () => {
    expect(DEFAULT_SHUTDOWN_GRACE_MS).toBeGreaterThanOrEqual(5_000);
    expect(DEFAULT_SHUTDOWN_GRACE_MS).toBeLessThanOrEqual(30_000);
  });

  it('cancelAllActiveRuns: residual tree kill when tracked children remain', async () => {
    const killAllTrackedTrees = vi.fn(() => ({
      attempted: 2,
      pids: [101, 202],
      results: [
        { pid: 101, platform: 'linux' as const, attempted: true, taskkill: false },
        { pid: 202, platform: 'linux' as const, attempted: true, taskkill: false },
      ],
    }));
    const deps = {
      listDbActiveRunIds: vi.fn(() => []),
      cancelRunsMany: vi.fn(() => ({ cancelled: 0 })),
      listActiveRunIds: vi.fn(() => []),
      abortRun: vi.fn(() => false),
      sleep: vi.fn(async () => undefined),
      now: vi.fn(() => 0),
      trackedChildCount: vi.fn(() => 2),
      killAllTrackedTrees,
    };

    const report = await cancelAllActiveRuns({ graceMs: 50, pollMs: 10, deps });

    expect(report.treeKilled).toBe(2);
    expect(report.treeKillPids).toEqual([101, 202]);
    expect(report.timedOut).toBe(false);
    expect(killAllTrackedTrees).toHaveBeenCalledTimes(1);
  });

  it('cancelAllActiveRuns: grace timeout triggers residual tree kill', async () => {
    let t = 0;
    const killAllTrackedTrees = vi.fn(() => ({
      attempted: 1,
      pids: [77],
      results: [{ pid: 77, platform: 'win32' as const, attempted: true, taskkill: true }],
    }));
    const deps = {
      listDbActiveRunIds: vi.fn(() => ['r1']),
      cancelRunsMany: vi.fn(() => ({ cancelled: 1 })),
      listActiveRunIds: vi.fn(() => ['r1']),
      abortRun: vi.fn(() => false),
      sleep: vi.fn(async (ms: number) => {
        t += ms;
      }),
      now: vi.fn(() => t),
      trackedChildCount: vi.fn(() => 1),
      killAllTrackedTrees,
    };

    const report = await cancelAllActiveRuns({ graceMs: 100, pollMs: 40, deps });

    expect(report.timedOut).toBe(true);
    expect(report.treeKilled).toBe(1);
    expect(report.treeKillPids).toEqual([77]);
    expect(killAllTrackedTrees).toHaveBeenCalledTimes(1);
  });

  it('shutdownServer: stores lastShutdown snapshot with treeKilled', async () => {
    const killAllTrackedTrees = vi.fn(() => ({
      attempted: 1,
      pids: [9],
      results: [{ pid: 9, platform: 'linux' as const, attempted: true, taskkill: false }],
    }));
    const report = await shutdownServer({
      graceMs: 50,
      walCheckpoint: false,
      deps: {
        stopWorkers: vi.fn(),
        listDbActiveRunIds: vi.fn(() => []),
        cancelRunsMany: vi.fn(() => ({ cancelled: 0 })),
        listActiveRunIds: vi.fn(() => []),
        abortRun: vi.fn(() => false),
        sleep: vi.fn(async () => undefined),
        now: vi.fn(() => 1234),
        trackedChildCount: vi.fn(() => 1),
        killAllTrackedTrees,
      },
    });

    expect(report.treeKilled).toBe(1);
    const snap = getLastShutdownSnapshot();
    expect(snap).toMatchObject({
      at: 1234,
      treeKilled: 1,
      treeKillPids: [9],
      timedOut: false,
      walCheckpointOk: null,
    });
  });
});

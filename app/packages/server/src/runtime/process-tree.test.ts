import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  killProcessTree,
  killAllTrackedTrees,
  trackChildPid,
  untrackChildPid,
  listTrackedChildPids,
  trackedChildCount,
  __resetTrackedChildPidsForTests,
} from './process-tree';

describe('process-tree', () => {
  beforeEach(() => {
    __resetTrackedChildPidsForTests();
  });

  it('tracks and untracks child pids', () => {
    trackChildPid(1001);
    trackChildPid(1002);
    expect(listTrackedChildPids().sort()).toEqual([1001, 1002]);
    expect(trackedChildCount()).toBe(2);
    untrackChildPid(1001);
    expect(listTrackedChildPids()).toEqual([1002]);
  });

  it('ignores invalid pids', () => {
    trackChildPid(0);
    trackChildPid(-1);
    trackChildPid(Number.NaN);
    expect(trackedChildCount()).toBe(0);
  });

  it('killProcessTree on win32 issues SIGTERM + taskkill /T /F', () => {
    const kill = vi.fn();
    const spawnTaskkill = vi.fn(() => ({ on: vi.fn() })) as unknown as typeof import('node:child_process').spawn;

    const r = killProcessTree(4242, {
      platform: 'win32',
      kill: kill as typeof process.kill,
      spawnTaskkill,
    });

    expect(r.attempted).toBe(true);
    expect(r.taskkill).toBe(true);
    expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(spawnTaskkill).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '4242', '/T', '/F'],
      expect.objectContaining({ windowsHide: true }),
    );
  });

  it('killProcessTree on posix tries process group after self', () => {
    const kill = vi.fn();
    const r = killProcessTree(77, {
      platform: 'linux',
      kill: kill as typeof process.kill,
    });
    expect(r.attempted).toBe(true);
    expect(r.taskkill).toBe(false);
    expect(kill).toHaveBeenCalledWith(77, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(-77, 'SIGTERM');
  });

  it('killAllTrackedTrees kills each and clears registry', () => {
    trackChildPid(11);
    trackChildPid(22);
    const kill = vi.fn();
    const report = killAllTrackedTrees({
      platform: 'linux',
      kill: kill as typeof process.kill,
    });
    expect(report.attempted).toBe(2);
    expect(report.pids.sort()).toEqual([11, 22]);
    expect(trackedChildCount()).toBe(0);
    expect(kill).toHaveBeenCalled();
  });
});

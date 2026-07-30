import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db/client.js', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    all: () => [],
  };
  return {
    db: {
      select: () => chain,
    },
  };
});

vi.mock('./runtime/registry.js', () => ({
  allBackends: () => [
    {
      id: 'claude-code',
      label: 'Claude Code',
      executionImplemented: true,
      supportsSessionResume: true,
      detect: async () => ({
        installed: true,
        version: '1.0.0',
        path: '/bin/claude',
      }),
    },
    {
      id: 'pi',
      label: 'Pi',
      executionImplemented: false,
      supportsSessionResume: false,
      detect: async () => ({
        installed: false,
        version: null,
        path: null,
      }),
    },
  ],
}));

vi.mock('./orchestration/run-control.js', () => ({
  listActiveRunIds: () => [],
}));

import { buildLiveProbes, projectLiveProbeRun } from './settings-live-probes.js';

describe('buildLiveProbes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns real runtime detect/readiness without _stub', async () => {
    const body = await buildLiveProbes(1_000);
    expect(body).not.toHaveProperty('_stub');
    expect(typeof body.pid).toBe('number');
    expect(body.pid).toBe(process.pid);
    expect(body.activeCount).toBe(0);
    expect(body.activeRuns).toBe(0);
    expect(Array.isArray(body.probes)).toBe(true);
    expect(body.probes).toEqual([]);
    expect(body.runtimes.length).toBe(2);

    const claude = body.runtimes.find((r) => r.id === 'claude-code');
    expect(claude).toMatchObject({
      installed: true,
      ready: true,
      executionImplemented: true,
      supportsSessionResume: true,
      version: '1.0.0',
    });

    const pi = body.runtimes.find((r) => r.id === 'pi');
    expect(pi).toMatchObject({
      installed: false,
      ready: false,
      executionImplemented: false,
    });
  });

  it('labels waiting age as queue age and keeps heartbeat age for running only', () => {
    const waiting = projectLiveProbeRun(
      {
        id: 'wait-1', runtime: 'opencode', status: 'waiting_local_directory', kind: 'issue',
        agentId: 'a-1', issueId: 'i-1', lastHeartbeatAt: 9_500, startedAt: 9_000,
        createdAt: 1_000, waitingLocalEnteredAt: 8_000,
      },
      10_000,
      new Set(),
    );
    expect(waiting).toMatchObject({ queueAgeMs: 2_000, heartbeatAgeMs: null });

    const running = projectLiveProbeRun(
      {
        id: 'run-1', runtime: 'opencode', status: 'running', kind: 'issue',
        agentId: 'a-1', issueId: 'i-1', lastHeartbeatAt: 9_500, startedAt: 9_000,
        createdAt: 1_000, waitingLocalEnteredAt: null,
      },
      10_000,
      new Set(['run-1']),
    );
    expect(running).toMatchObject({ queueAgeMs: null, heartbeatAgeMs: 500, inProcess: true });
  });
});

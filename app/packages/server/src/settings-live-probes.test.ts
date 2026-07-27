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

import { buildLiveProbes } from './settings-live-probes.js';

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
});

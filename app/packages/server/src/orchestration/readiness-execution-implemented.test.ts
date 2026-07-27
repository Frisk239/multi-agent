import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeBackend, DetectResult } from '../runtime/types.js';

const mocks = vi.hoisted(() => {
  const agents = { id: 'id', __table: 'agents' as const };
  const agentRuns = {
    agentId: 'agentId',
    status: 'status',
    __table: 'agentRuns' as const,
  };
  return {
    agents,
    agentRuns,
    agentRow: null as null | {
      id: string;
      runtime: string;
      concurrency: number;
    },
    runningCount: 0,
    getBackend: vi.fn(),
    resolveWorkspaceCwd: vi.fn(),
  };
});

vi.mock('../db/schema.js', () => ({
  agents: mocks.agents,
  agentRuns: mocks.agentRuns,
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: () => ({
          get: () => {
            if (table === mocks.agents) return mocks.agentRow;
            if (table === mocks.agentRuns) return { cnt: mocks.runningCount };
            return null;
          },
        }),
      }),
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  sql: Object.assign((..._args: unknown[]) => 'COUNT', { raw: vi.fn() }),
}));

vi.mock('../runtime/registry.js', () => ({
  getBackend: mocks.getBackend,
}));

vi.mock('../workspace-cwd.js', () => ({
  resolveWorkspaceCwd: mocks.resolveWorkspaceCwd,
}));

import { computeAgentReadiness } from './readiness.js';

function makeBackend(opts: {
  installed: boolean;
  executionImplemented?: boolean;
}): RuntimeBackend {
  const det: DetectResult = {
    installed: opts.installed,
    path: opts.installed ? '/bin/pi' : null,
    version: opts.installed ? '1.0.0' : null,
  };
  return {
    id: 'pi',
    label: 'Pi SDK',
    executionImplemented: opts.executionImplemented,
    detect: async () => det,
    execute: async () => ({ finalText: '', exitReason: 'failed' as const }),
  };
}

describe('readiness executionImplemented (Slice 44)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;
    mocks.runningCount = 0;
    mocks.agentRow = {
      id: 'agt-pi-1',
      runtime: 'pi',
      concurrency: 1,
    };
    mocks.resolveWorkspaceCwd.mockReturnValue({
      configured: false,
      exists: false,
      path: null,
    });
  });

  it('status is error when installed but executionImplemented=false', async () => {
    mocks.agentRow = {
      id: 'agt-pi-installed-stub',
      runtime: 'pi',
      concurrency: 1,
    };
    mocks.getBackend.mockReturnValue(
      makeBackend({ installed: true, executionImplemented: false }),
    );

    const rd = await computeAgentReadiness('agt-pi-installed-stub');
    expect(rd).not.toBeNull();
    expect(rd!.status).toBe('error');
    expect(rd!.status).not.toBe('ready');
    expect(rd!.status).not.toBe('busy');
    expect(rd!.runtimeInstalled).toBe(true);
    expect(rd!.detail).toMatch(/尚未实现|禁止假完成|不可派活/);
  });

  it('status is runtime_missing when not installed (even if stub)', async () => {
    // 独立 agentId，避免 probeSuccessTTL 从其它用例串入
    mocks.agentRow = {
      id: 'agt-pi-not-installed',
      runtime: 'pi',
      concurrency: 1,
    };
    mocks.getBackend.mockReturnValue(
      makeBackend({ installed: false, executionImplemented: false }),
    );

    const rd = await computeAgentReadiness('agt-pi-not-installed');
    expect(rd!.status).toBe('runtime_missing');
    expect(rd!.runtimeInstalled).toBe(false);
  });

  it('status can be ready when executionImplemented omitted/true and installed', async () => {
    mocks.agentRow = {
      id: 'agt-real-backend',
      runtime: 'claude-code',
      concurrency: 1,
    };
    mocks.getBackend.mockReturnValue(
      makeBackend({ installed: true /* flag omitted → true */ }),
    );

    const rd = await computeAgentReadiness('agt-real-backend');
    expect(rd!.status).toBe('ready');
    expect(rd!.runtimeInstalled).toBe(true);
  });

  it('returns null when agent missing', async () => {
    mocks.agentRow = null;
    mocks.getBackend.mockReturnValue(
      makeBackend({ installed: true, executionImplemented: false }),
    );
    const rd = await computeAgentReadiness('missing');
    expect(rd).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DB and Drizzle ORM — query shape matches optimized subtree walk
const mocks = vi.hoisted(() => ({
  agentRunsGet: vi.fn(),
  agentRunsAll: vi.fn(),
  agentsGet: vi.fn(),
  runMessagesGet: vi.fn(),
}));

vi.mock('../db/client.js', () => {
  return {
    db: {
      select: () => ({
        from: (table: any) => {
          if (table === 'agent_run_mock') {
            return {
              where: () => ({
                get: mocks.agentRunsGet,
                all: mocks.agentRunsAll,
              }),
            };
          }
          if (table === 'agent_mock') {
            return {
              where: () => ({
                get: mocks.agentsGet,
              }),
            };
          }
          if (table === 'run_message_mock') {
            return {
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    get: mocks.runMessagesGet,
                  }),
                }),
              }),
            };
          }
          return {
            where: () => ({
              get: mocks.agentRunsGet,
              all: mocks.agentRunsAll,
            }),
          };
        },
      }),
    },
  };
});

vi.mock('../db/schema.js', () => ({
  agentRuns: 'agent_run_mock',
  agents: 'agent_mock',
  runMessages: 'run_message_mock',
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
}));

import {
  getRunTree,
  getDirectChildren,
  truncateSubagentSummary,
  getSubagentSummaryCap,
} from './subagent-tree';

describe('subagent-tree', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MA_SUBAGENT_SUMMARY_CAP;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('summary cap', () => {
    it('defaults cap to 2000', () => {
      expect(getSubagentSummaryCap()).toBe(2000);
    });

    it('reads MA_SUBAGENT_SUMMARY_CAP', () => {
      process.env.MA_SUBAGENT_SUMMARY_CAP = '100';
      expect(getSubagentSummaryCap()).toBe(100);
    });

    it('truncates long summary with ellipsis', () => {
      process.env.MA_SUBAGENT_SUMMARY_CAP = '10';
      const out = truncateSubagentSummary('abcdefghijklmnop');
      expect(out).toBe('abcdefghij…');
      expect(out!.length).toBe(11);
    });

    it('keeps short summary intact', () => {
      process.env.MA_SUBAGENT_SUMMARY_CAP = '100';
      expect(truncateSubagentSummary('short')).toBe('short');
    });

    it('returns null for nullish', () => {
      expect(truncateSubagentSummary(null)).toBeNull();
      expect(truncateSubagentSummary(undefined)).toBeNull();
    });
  });

  it('returns null if root run does not exist', () => {
    mocks.agentRunsGet.mockReturnValue(null);
    const tree = getRunTree('non-existent-run');
    expect(tree).toBeNull();
  });

  it('builds recursive run tree with subagents and summaries correctly', () => {
    const rootRun = {
      id: 'parent-run-1',
      parentRunId: null,
      agentId: 'leader-agent',
      status: 'completed',
      kind: 'issue',
      quickPrompt: 'Decompose task',
      isLeader: 1,
      squadId: 'squad-1',
      createdAt: 1000,
      startedAt: 1050,
      finishedAt: 5000,
      error: null,
      tokensInput: 100,
      tokensOutput: 200,
    };

    const childRun1 = {
      id: 'child-run-1',
      parentRunId: 'parent-run-1',
      agentId: 'coder-agent',
      status: 'completed',
      kind: 'quick_create',
      quickPrompt: 'Write code for feature',
      isLeader: 0,
      squadId: null,
      createdAt: 2000,
      startedAt: 2100,
      finishedAt: 4000,
      error: null,
      tokensInput: 500,
      tokensOutput: 800,
    };

    const childRun2 = {
      id: 'child-run-2',
      parentRunId: 'parent-run-1',
      agentId: 'reviewer-agent',
      status: 'running',
      kind: 'quick_create',
      quickPrompt: 'Review PR',
      isLeader: 0,
      squadId: null,
      createdAt: 2500,
      startedAt: 2600,
      finishedAt: null,
      error: null,
      tokensInput: 150,
      tokensOutput: 50,
    };

    const grandChildRun = {
      id: 'grandchild-run-1',
      parentRunId: 'child-run-1',
      agentId: 'test-agent',
      status: 'completed',
      kind: 'quick_create',
      quickPrompt: 'Run vitest',
      isLeader: 0,
      squadId: null,
      createdAt: 3000,
      startedAt: 3100,
      finishedAt: 3500,
      error: null,
      tokensInput: 200,
      tokensOutput: 300,
    };

    const agentsById: Record<string, any> = {
      'leader-agent': { id: 'leader-agent', name: 'Leader Bot', category: 'squad-leader' },
      'coder-agent': { id: 'coder-agent', name: 'Coder Bot', category: 'developer' },
      'reviewer-agent': { id: 'reviewer-agent', name: 'Review Bot', category: 'reviewer' },
      'test-agent': { id: 'test-agent', name: 'Tester Bot', category: 'tester' },
    };

    // BFS: root get; children of root; children of child1; children of child2; children of grandchild
    mocks.agentRunsGet.mockReturnValue(rootRun);
    mocks.agentRunsAll
      .mockReturnValueOnce([childRun1, childRun2]) // root children
      .mockReturnValueOnce([grandChildRun]) // child1 children
      .mockReturnValueOnce([]) // child2 children
      .mockReturnValueOnce([]); // grandchild children

    mocks.agentsGet.mockImplementation(() => {
      // order of unique agentIds from subtreeRuns push order: root, c1, c2, gc
      // but where(eq) loses id — return via call order
      const order = ['leader-agent', 'coder-agent', 'reviewer-agent', 'test-agent'];
      const idx = mocks.agentsGet.mock.calls.length - 1;
      return agentsById[order[idx]] ?? null;
    });

    const summariesByCall = [
      null, // root
      { body: 'Implemented feature cleanly.' }, // child1
      null, // child2 -> fallback quickPrompt
      { body: 'All 5 tests passed.' }, // grandchild
    ];
    mocks.runMessagesGet.mockImplementation(() => {
      const idx = mocks.runMessagesGet.mock.calls.length - 1;
      return summariesByCall[idx] ?? null;
    });

    const tree = getRunTree('parent-run-1');

    expect(tree).not.toBeNull();
    expect(tree?.id).toBe('parent-run-1');
    expect(tree?.agentName).toBe('Leader Bot');
    expect(tree?.children.length).toBe(2);

    const c1 = tree?.children[0];
    expect(c1?.id).toBe('child-run-1');
    expect(c1?.agentName).toBe('Coder Bot');
    expect(c1?.summary).toBe('Implemented feature cleanly.');
    expect(c1?.durationMs).toBe(1900);
    expect(c1?.children.length).toBe(1);

    const gc1 = c1?.children[0];
    expect(gc1?.id).toBe('grandchild-run-1');
    expect(gc1?.agentName).toBe('Tester Bot');
    expect(gc1?.summary).toBe('All 5 tests passed.');

    const c2 = tree?.children[1];
    expect(c2?.id).toBe('child-run-2');
    expect(c2?.status).toBe('running');
    expect(c2?.summary).toBe('Review PR'); // fallback to prompt when no assistant msg
  });

  it('caps summary length on tree nodes', () => {
    process.env.MA_SUBAGENT_SUMMARY_CAP = '20';
    const longBody = 'X'.repeat(50);
    const rootRun = {
      id: 'root-cap',
      parentRunId: null,
      agentId: 'a1',
      status: 'completed',
      kind: 'issue',
      quickPrompt: 'root',
      isLeader: 0,
      squadId: null,
      createdAt: 1000,
      startedAt: 1000,
      finishedAt: 2000,
      error: null,
      tokensInput: null,
      tokensOutput: null,
    };

    mocks.agentRunsGet.mockReturnValue(rootRun);
    mocks.agentRunsAll.mockReturnValue([]);
    mocks.agentsGet.mockReturnValue({ id: 'a1', name: 'A', category: 'dev' });
    mocks.runMessagesGet.mockReturnValue({ body: longBody });

    const tree = getRunTree('root-cap');
    expect(tree?.summary).toBe(`${'X'.repeat(20)}…`);
    expect(tree!.summary!.length).toBe(21);
  });

  it('getDirectChildren returns direct children nodes', () => {
    const childRun = {
      id: 'child-run-A',
      parentRunId: 'parent-run-2',
      agentId: 'sub-agent-A',
      status: 'completed',
      kind: 'quick_create',
      quickPrompt: 'Child task A',
      isLeader: 0,
      squadId: null,
      createdAt: 1200,
      startedAt: 1250,
      finishedAt: 1800,
      error: null,
      tokensInput: null,
      tokensOutput: null,
    };

    mocks.agentRunsAll.mockReturnValue([childRun]);
    mocks.agentsGet.mockReturnValue({
      id: 'sub-agent-A',
      name: 'Sub A',
      category: 'dev',
    });
    mocks.runMessagesGet.mockReturnValue(null);

    const children = getDirectChildren('parent-run-2');
    expect(children.length).toBe(1);
    expect(children[0].id).toBe('child-run-A');
    expect(children[0].summary).toBe('Child task A');
  });
});

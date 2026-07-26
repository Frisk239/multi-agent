import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB and Drizzle ORM
const mocks = vi.hoisted(() => ({
  agentRunsGet: vi.fn(),
  agentRunsAll: vi.fn(),
  agentsAll: vi.fn(),
  runMessagesAll: vi.fn(),
}));

vi.mock('../db/client.js', () => {
  return {
    db: {
      select: (fields?: any) => ({
        from: (table: any) => {
          if (table === 'agent_run_mock') {
            return {
              where: () => ({ get: mocks.agentRunsGet }),
              all: mocks.agentRunsAll,
            };
          }
          if (table === 'agent_mock') {
            return {
              all: mocks.agentsAll,
            };
          }
          if (table === 'run_message_mock') {
            return {
              where: () => ({
                orderBy: () => ({
                  all: mocks.runMessagesAll,
                }),
              }),
            };
          }
          return {
            where: () => ({ get: mocks.agentRunsGet, all: mocks.agentRunsAll }),
            all: mocks.agentRunsAll,
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

import { getRunTree, getDirectChildren } from './subagent-tree';

describe('subagent-tree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    mocks.agentRunsGet.mockReturnValue(rootRun);
    mocks.agentRunsAll.mockReturnValue([rootRun, childRun1, childRun2, grandChildRun]);
    mocks.agentsAll.mockReturnValue([
      { id: 'leader-agent', name: 'Leader Bot', category: 'squad-leader' },
      { id: 'coder-agent', name: 'Coder Bot', category: 'developer' },
      { id: 'reviewer-agent', name: 'Review Bot', category: 'reviewer' },
      { id: 'test-agent', name: 'Tester Bot', category: 'tester' },
    ]);
    mocks.runMessagesAll.mockReturnValue([
      { runId: 'child-run-1', seq: 2, kind: 'assistant', body: 'Implemented feature cleanly.' },
      { runId: 'grandchild-run-1', seq: 1, kind: 'assistant', body: 'All 5 tests passed.' },
    ]);

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

  it('getDirectChildren returns direct children nodes', () => {
    const rootRun = {
      id: 'parent-run-2',
      parentRunId: null,
      agentId: 'leader-agent',
      status: 'completed',
      kind: 'issue',
      quickPrompt: 'Parent task',
      isLeader: 1,
      squadId: null,
      createdAt: 1000,
      startedAt: 1050,
      finishedAt: 2000,
    };

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
    };

    mocks.agentRunsGet.mockReturnValue(rootRun);
    mocks.agentRunsAll.mockReturnValue([rootRun, childRun]);
    mocks.agentsAll.mockReturnValue([]);
    mocks.runMessagesAll.mockReturnValue([]);

    const children = getDirectChildren('parent-run-2');
    expect(children.length).toBe(1);
    expect(children[0].id).toBe('child-run-A');
  });
});

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
  projectTreeNodeTerminalReason,
} from './subagent-tree';
import {
  setModelRatesForTest,
  resetModelRatesCache,
} from '../runtime/model-rates.js';

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

  describe('projectTreeNodeTerminalReason', () => {
    it('projects timeout / cancelled / completed for terminal rows', () => {
      expect(
        projectTreeNodeTerminalReason({
          status: 'failed',
          createdAt: 1,
          failureReason: 'timeout',
        }),
      ).toBe('timeout');
      expect(
        projectTreeNodeTerminalReason({
          status: 'cancelled',
          createdAt: 1,
          failureReason: 'timeout', // stale reason must not win
        }),
      ).toBe('cancelled');
      expect(
        projectTreeNodeTerminalReason({
          status: 'completed',
          createdAt: 1,
        }),
      ).toBe('completed');
    });

    it('returns null while the run is still active', () => {
      expect(
        projectTreeNodeTerminalReason({
          status: 'running',
          createdAt: 1,
        }),
      ).toBeNull();
      expect(
        projectTreeNodeTerminalReason({
          status: 'queued',
          createdAt: 1,
        }),
      ).toBeNull();
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

describe('G2-3 cost rollup (hermes delegate_tool.py:2730)', () => {
  // 价表：prompt $1 / 1M，completion $2 / 1M —— 便于手算断言
  const rate = { promptUsdPer1M: 1, completionUsdPer1M: 2 };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MA_SUBAGENT_SUMMARY_CAP;
    setModelRatesForTest({ models: { 'gpt-4o-test': rate } });
  });

  afterEach(() => {
    resetModelRatesCache();
  });

  function makeRun(partial: Record<string, unknown>): Record<string, unknown> {
    return {
      id: 'r',
      parentRunId: null,
      agentId: 'a1',
      status: 'completed',
      kind: 'issue',
      quickPrompt: null,
      isLeader: 0,
      squadId: null,
      createdAt: 1000,
      startedAt: 1050,
      finishedAt: 5000,
      error: null,
      tokensInput: null,
      tokensOutput: null,
      model: 'gpt-4o-test',
      ...partial,
    };
  }

  it('rolls child costs into parent (nested fold, all costed)', () => {
    const root = makeRun({ id: 'p', tokensInput: 100, tokensOutput: 200 }); // 0.0005
    const c1 = makeRun({ id: 'c1', parentRunId: 'p', tokensInput: 500, tokensOutput: 800 }); // 0.0021
    const c2 = makeRun({ id: 'c2', parentRunId: 'p', tokensInput: 150, tokensOutput: 50 }); // 0.00025
    const gc = makeRun({ id: 'gc', parentRunId: 'c1', tokensInput: 200, tokensOutput: 300 }); // 0.0008

    mocks.agentRunsGet.mockReturnValue(root);
    mocks.agentRunsAll
      .mockReturnValueOnce([c1, c2])
      .mockReturnValueOnce([gc])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);
    mocks.agentsGet.mockReturnValue(null);
    mocks.runMessagesGet.mockReturnValue(null);

    const tree = getRunTree('p');
    expect(tree?.costUsd).toBeCloseTo(0.00365, 6); // 自身 + c1(含 gc) + c2
    expect(tree?.uncosted).toBe(false);
    // 子节点已含子树（gc 折入 c1）
    expect(tree?.children[0].costUsd).toBeCloseTo(0.0029, 6);
    expect(tree?.children[0].children[0].costUsd).toBeCloseTo(0.0008, 6);
    expect(tree?.children[1].costUsd).toBeCloseTo(0.00025, 6);
  });

  it('keeps partial uncosted when a node has tokens but no rates', () => {
    const root = makeRun({ id: 'p', model: 'unknown-model', tokensInput: 100, tokensOutput: 200 });
    const c1 = makeRun({ id: 'c1', parentRunId: 'p', tokensInput: 500, tokensOutput: 800 });
    const c2 = makeRun({ id: 'c2', parentRunId: 'p', tokensInput: 150, tokensOutput: 50 });

    mocks.agentRunsGet.mockReturnValue(root);
    mocks.agentRunsAll.mockReturnValueOnce([c1, c2]).mockReturnValueOnce([]).mockReturnValueOnce([]);
    mocks.agentsGet.mockReturnValue(null);
    mocks.runMessagesGet.mockReturnValue(null);

    const tree = getRunTree('p');
    // 父自身 uncosted（未知 model），子全 costed → 总数 = 子成本之和 + 部分未计价标记
    expect(tree?.costUsd).toBeCloseTo(0.00235, 6);
    expect(tree?.uncosted).toBe(true);
    expect(tree?.children[0].costUsd).toBeCloseTo(0.0021, 6);
    expect(tree?.children[0].uncosted).toBe(false);
  });

  it('null cost when nothing is costed (no tokens → not flagged uncosted)', () => {
    const root = makeRun({ id: 'p' }); // 无 token
    const child = makeRun({ id: 'c1', parentRunId: 'p' }); // 无 token

    mocks.agentRunsGet.mockReturnValue(root);
    mocks.agentRunsAll.mockReturnValueOnce([child]).mockReturnValueOnce([]);
    mocks.agentsGet.mockReturnValue(null);
    mocks.runMessagesGet.mockReturnValue(null);

    const tree = getRunTree('p');
    expect(tree?.costUsd).toBeNull();
    expect(tree?.uncosted).toBe(false); // no_tokens 不污染「部分未计价」
  });

  it('direct children endpoint carries own cost only', () => {
    const child = makeRun({ id: 'c1', tokensInput: 500, tokensOutput: 800 });
    mocks.agentRunsAll.mockReturnValue([child]);
    mocks.agentsGet.mockReturnValue(null);
    mocks.runMessagesGet.mockReturnValue(null);

    const children = getDirectChildren('p');
    expect(children[0].costUsd).toBeCloseTo(0.0021, 6);
    expect(children[0].uncosted).toBe(false);
  });
});

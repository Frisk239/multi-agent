import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  agentRunsGet: vi.fn(),
  agentRunsAll: vi.fn(),
  agentsGet: vi.fn(),
  insertRun: vi.fn(),
  insertMsg: vi.fn(),
  maxSeqGet: vi.fn(),
  enqueueAgentRun: vi.fn(),
  enqueueLeaderRun: vi.fn(),
  computeAgentReadiness: vi.fn(),
  loadSquadDetail: vi.fn(),
  wakeRunWorker: vi.fn(),
  eventBusPublish: vi.fn(),
  toAgentRun: vi.fn((row: any) => row),
  toRunMessage: vi.fn((row: any) => row),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('../db/client.js', () => {
  const selectFrom = (table: any) => {
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
          get: mocks.maxSeqGet,
        }),
      };
    }
    return {
      where: () => ({
        get: vi.fn(),
        all: vi.fn(),
      }),
    };
  };

  return {
    db: {
      select: () => ({
        from: selectFrom,
      }),
      insert: (table: any) => ({
        values: (vals: any) => ({
          run: () => {
            if (table === 'agent_run_mock') mocks.insertRun(vals);
            if (table === 'run_message_mock') mocks.insertMsg(vals);
          },
        }),
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
  sql: vi.fn(),
}));

vi.mock('../db/squad-loader.js', () => ({
  loadSquadDetail: (...args: any[]) => mocks.loadSquadDetail(...args),
}));

vi.mock('./run-service.js', () => ({
  enqueueAgentRun: (...args: any[]) => mocks.enqueueAgentRun(...args),
  enqueueLeaderRun: (...args: any[]) => mocks.enqueueLeaderRun(...args),
}));

vi.mock('./run-worker.js', () => ({
  wakeRunWorker: (...args: any[]) => mocks.wakeRunWorker(...args),
}));

vi.mock('./readiness.js', () => ({
  computeAgentReadiness: (...args: any[]) => mocks.computeAgentReadiness(...args),
}));

vi.mock('./event-bus.js', () => ({
  eventBus: {
    publish: (...args: any[]) => mocks.eventBusPublish(...args),
  },
}));

vi.mock('../db/reshape.js', () => ({
  toAgentRun: (row: any) => mocks.toAgentRun(row),
  toRunMessage: (row: any) => mocks.toRunMessage(row),
}));

vi.mock('../logger.js', () => ({
  logger: {
    error: (...args: any[]) => mocks.loggerError(...args),
    warn: (...args: any[]) => mocks.loggerWarn(...args),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  parseAndDispatchSubagents,
  computeRunDepth,
  getSubagentMaxDepth,
} from './subagent-dispatch';

describe('subagent-dispatch', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MA_SUBAGENT_MAX_DEPTH;
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    mocks.maxSeqGet.mockReturnValue({ m: 0 });
    mocks.enqueueAgentRun.mockResolvedValue({
      run: { id: 'child-run' },
      skipped: false,
      reason: null,
      detail: null,
    });
    mocks.enqueueLeaderRun.mockResolvedValue({
      run: { id: 'leader-child' },
      skipped: false,
      reason: null,
      detail: null,
    });
    mocks.computeAgentReadiness.mockResolvedValue({
      agentId: 'agent-a',
      runtime: 'claude-code',
      runtimeInstalled: true,
      status: 'ready',
      detail: null,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getSubagentMaxDepth / computeRunDepth', () => {
    it('defaults K to 2', () => {
      expect(getSubagentMaxDepth()).toBe(2);
    });

    it('reads MA_SUBAGENT_MAX_DEPTH', () => {
      process.env.MA_SUBAGENT_MAX_DEPTH = '3';
      expect(getSubagentMaxDepth()).toBe(3);
    });

    it('walks parentRunId chain for depth', () => {
      const rows: Record<string, any> = {
        root: { id: 'root', parentRunId: null },
        d1: { id: 'd1', parentRunId: 'root' },
        d2: { id: 'd2', parentRunId: 'd1' },
      };
      mocks.agentRunsGet.mockImplementation(() => {
        // last where(eq(id)) — simple sequential: return by call order is flaky;
        // use a stack via mockImplementation that reads id from eq isn't available,
        // so map by successive ids using call history of the same mock.
        return null;
      });

      // Per-call return values: each computeRunDepth walk hits current then parents
      // We implement a Map lookup via a custom queue of returned rows keyed by id.
      const byId = rows;
      mocks.agentRunsGet.mockImplementation(() => {
        // Not ideal without eq args — instead drive with ordered returns for a known walk
        return null;
      });

      // Simpler: ordered returns for computeRunDepth('d2'):
      // get d2 -> parent d1; get d1 -> parent root; get root -> stop
      mocks.agentRunsGet
        .mockReturnValueOnce(byId.d2)
        .mockReturnValueOnce(byId.d1)
        .mockReturnValueOnce(byId.root);
      expect(computeRunDepth('d2')).toBe(2);

      mocks.agentRunsGet
        .mockReturnValueOnce(byId.root);
      expect(computeRunDepth('root')).toBe(0);
    });

    it('breaks cycles with walk cap', () => {
      process.env.MA_SUBAGENT_MAX_DEPTH = '2';
      // a -> b -> a cycle
      mocks.agentRunsGet.mockImplementation(() => {
        // alternate parents via call count
        const n = mocks.agentRunsGet.mock.calls.length;
        if (n % 2 === 1) return { id: 'a', parentRunId: 'b' };
        return { id: 'b', parentRunId: 'a' };
      });
      // seen-set should stop before infinite loop; depth increments while walking
      const depth = computeRunDepth('a');
      expect(depth).toBeLessThanOrEqual(2 + 5);
      expect(depth).toBeGreaterThan(0);
    });
  });

  describe('parseAndDispatchSubagents depth gate', () => {
    it('refuses dispatch when parent depth >= K and writes system message', async () => {
      process.env.MA_SUBAGENT_MAX_DEPTH = '2';
      // parent is depth 2: parent -> mid -> root
      mocks.agentRunsGet
        // load parent run
        .mockReturnValueOnce({
          id: 'parent',
          parentRunId: 'mid',
          issueId: 'iss-1',
        })
        // computeRunDepth(parent): self
        .mockReturnValueOnce({ id: 'parent', parentRunId: 'mid' })
        // mid
        .mockReturnValueOnce({ id: 'mid', parentRunId: 'root' })
        // root
        .mockReturnValueOnce({ id: 'root', parentRunId: null });

      await parseAndDispatchSubagents(
        'parent',
        '[delegate:agent-a](do work)',
      );

      expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
      expect(mocks.insertRun).not.toHaveBeenCalled();
      expect(mocks.insertMsg).toHaveBeenCalled();
      const msgBody = mocks.insertMsg.mock.calls[0][0].body as string;
      expect(msgBody).toMatch(/depth=2/);
      expect(msgBody).toMatch(/K=2/);
    });

    it('allows dispatch when parent depth < K', async () => {
      process.env.MA_SUBAGENT_MAX_DEPTH = '2';
      mocks.agentRunsGet
        // parent load
        .mockReturnValueOnce({
          id: 'parent',
          parentRunId: null,
          issueId: 'iss-1',
        })
        // computeRunDepth: root only
        .mockReturnValueOnce({ id: 'parent', parentRunId: null });

      mocks.agentsGet.mockReturnValue({
        id: 'agent-a',
        runtime: 'claude-code',
      });

      await parseAndDispatchSubagents(
        'parent',
        '[delegate:agent-a](implement feature)',
      );

      expect(mocks.enqueueAgentRun).toHaveBeenCalledWith(
        'iss-1',
        'agent-a',
        expect.objectContaining({
          parentRunId: 'parent',
          quickPrompt: 'implement feature',
        }),
      );
    });
  });

  describe('issue path enqueue failure visibility', () => {
    it('writes parent system message when enqueue skips', async () => {
      mocks.agentRunsGet
        .mockReturnValueOnce({
          id: 'parent',
          parentRunId: null,
          issueId: 'iss-1',
        })
        .mockReturnValueOnce({ id: 'parent', parentRunId: null });

      mocks.agentsGet.mockReturnValue({ id: 'agent-a', runtime: 'claude-code' });
      mocks.enqueueAgentRun.mockResolvedValue({
        run: null,
        skipped: true,
        reason: 'runtime_missing',
        detail: 'runtime claude-code 未安装或不在 PATH',
      });

      await parseAndDispatchSubagents('parent', '[delegate:agent-a](task)');

      expect(mocks.insertMsg).toHaveBeenCalled();
      const body = mocks.insertMsg.mock.calls[0][0].body as string;
      expect(body).toMatch(/子代理委派失败/);
      expect(body).toMatch(/runtime claude-code/);
    });
  });

  describe('no-issue path readiness gate', () => {
    it('does not insert when readiness fails', async () => {
      mocks.agentRunsGet
        .mockReturnValueOnce({
          id: 'parent',
          parentRunId: null,
          issueId: null,
          projectId: 'p1',
          chatThreadId: null,
        })
        .mockReturnValueOnce({ id: 'parent', parentRunId: null });

      mocks.agentsGet.mockReturnValue({ id: 'agent-a', runtime: 'claude-code' });
      mocks.computeAgentReadiness.mockResolvedValue({
        agentId: 'agent-a',
        runtime: 'claude-code',
        status: 'runtime_missing',
        detail: 'runtime claude-code 未安装或不在 PATH',
      });

      await parseAndDispatchSubagents('parent', '[delegate:agent-a](task)');

      expect(mocks.insertRun).not.toHaveBeenCalled();
      expect(mocks.wakeRunWorker).not.toHaveBeenCalled();
      expect(mocks.insertMsg).toHaveBeenCalled();
      const body = mocks.insertMsg.mock.calls[0][0].body as string;
      expect(body).toMatch(/runtime_missing|未安装/);
    });

    it('inserts quick_create child when readiness ok', async () => {
      const parent = {
        id: 'parent',
        parentRunId: null,
        issueId: null,
        projectId: 'p1',
        chatThreadId: 'chat-1',
      };
      const agent = { id: 'agent-a', runtime: 'claude-code' };
      const insertedRow = {
        id: 'new-run',
        parentRunId: 'parent',
        agentId: 'agent-a',
        status: 'queued',
      };

      // parent load + depth + agent resolve + agent re-fetch + inserted row get
      mocks.agentRunsGet
        .mockReturnValueOnce(parent)
        .mockReturnValueOnce(parent)
        .mockReturnValueOnce(insertedRow);
      mocks.agentsGet
        .mockReturnValueOnce(agent) // resolve target
        .mockReturnValueOnce(agent); // realAgent re-fetch

      await parseAndDispatchSubagents('parent', '[delegate:agent-a](no-issue task)');

      expect(mocks.insertRun).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-a',
          parentRunId: 'parent',
          kind: 'quick_create',
          quickPrompt: 'no-issue task',
          projectId: 'p1',
          chatThreadId: 'chat-1',
          status: 'queued',
        }),
      );
      expect(mocks.wakeRunWorker).toHaveBeenCalled();
      expect(mocks.eventBusPublish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'run:queued' }),
      );
    });
  });

  describe('JSON delegate parsing', () => {
    it('parses fenced json delegate', async () => {
      mocks.agentRunsGet
        .mockReturnValueOnce({
          id: 'parent',
          parentRunId: null,
          issueId: 'iss-1',
        })
        .mockReturnValueOnce({ id: 'parent', parentRunId: null });
      mocks.agentsGet.mockReturnValue({ id: 'agent-b', runtime: 'claude-code' });

      const text = '```json\n{"delegate":"agent-b","prompt":"from json"}\n```';
      await parseAndDispatchSubagents('parent', text);

      expect(mocks.enqueueAgentRun).toHaveBeenCalledWith(
        'iss-1',
        'agent-b',
        expect.objectContaining({ quickPrompt: 'from json' }),
      );
    });
  });
});

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { registerRunAbort, abortRun, hasRunAbort, clearRunAbort, listActiveRunIds } from './run-control';

const mocks = vi.hoisted(() => ({
  selectGet: vi.fn(),
  rerunIssue: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: mocks.selectGet,
        }),
      }),
    }),
  },
}));

vi.mock('../db/schema.js', () => ({
  agentRuns: { id: 'id' },
  agents: {},
  comments: {},
  issues: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('../db/reshape.js', () => ({
  toAgentRun: (row: any) => row,
  toComment: (row: any) => row,
}));

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: vi.fn() },
}));

vi.mock('./run-worker.js', () => ({
  wakeRunWorker: vi.fn(),
}));

vi.mock('./readiness.js', () => ({
  computeAgentReadiness: vi.fn(),
}));

vi.mock('./inbox-writer.js', () => ({
  notifyEnqueueSkipped: vi.fn(),
}));

vi.mock('../db/squad-loader.js', () => ({
  loadSquadDetail: vi.fn(),
}));

// Import after mocks
import { retryRun } from './run-service';

describe('run-control', () => {
  afterEach(() => {
    // Clean up any registered runs to prevent state leakage
    for (const id of listActiveRunIds()) {
      clearRunAbort(id);
    }
  });

  it('registers and retrieves AbortSignal for a run', () => {
    const runId = 'run-ctrl-1';
    const signal = registerRunAbort(runId);

    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
    expect(hasRunAbort(runId)).toBe(true);
    expect(listActiveRunIds()).toContain(runId);

    clearRunAbort(runId);
    expect(hasRunAbort(runId)).toBe(false);
  });

  it('aborts registered run controller when abortRun is called', () => {
    const runId = 'run-ctrl-2';
    const signal = registerRunAbort(runId);

    expect(abortRun(runId)).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(hasRunAbort(runId)).toBe(false);
  });

  it('returns false when abortRun is called on non-existent runId', () => {
    expect(abortRun('non-existent-run')).toBe(false);
  });
});

describe('retryRun accepts timed_out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows retry when source status is timed_out', async () => {
    mocks.selectGet.mockReturnValue({
      id: 'run-to',
      status: 'timed_out',
      kind: 'issue',
      issueId: 'iss-1',
      agentId: 'agt-1',
      chatThreadId: null,
    });

    // retryRun → rerunIssue path: mock readiness soft-bypass via env not needed if we mock deeper.
    // rerunIssue is same-module; intercept by making subsequent DB/readiness fail soft.
    // Instead assert the pre-check accepts timed_out by not returning the "仅 failed..." error.
    // We stub MA_ENQUEUE and agents so checkAndEnqueue can complete or skip cleanly.

    // Force agent missing so checkAndEnqueue returns skipped without full readiness chain complexity.
    // But that requires more selects. Simpler: spy the whole chain by making selectGet return
    // timed_out once, then null agent on next.

    // First get: source run; subsequent gets inside checkAndEnqueue: agent etc.
    let call = 0;
    mocks.selectGet.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return {
          id: 'run-to',
          status: 'timed_out',
          kind: 'issue',
          issueId: 'iss-1',
          agentId: 'agt-1',
          chatThreadId: null,
        };
      }
      // agent lookup → missing → skipped agent_missing
      return null;
    });

    const res = await retryRun('run-to');
    // Not 400 "仅 failed..." — timed_out passed RETRYABLE gate
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected timed_out retry to proceed past status gate');
    expect(res.error).not.toMatch(/仅 failed/);
    // agent missing path after gate
    expect(res.error).toMatch(/不存在|agent/i);
  });

  it('rejects non-retryable statuses', async () => {
    mocks.selectGet.mockReturnValue({
      id: 'run-running',
      status: 'running',
      kind: 'issue',
      issueId: 'iss-1',
      agentId: 'agt-1',
    });
    const res = await retryRun('run-running');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected rejection');
    expect(res.status).toBe(400);
    expect(res.error).toMatch(/timed_out/);
  });

  it('rejects when run missing', async () => {
    mocks.selectGet.mockReturnValue(undefined);
    const res = await retryRun('nope');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected missing run');
    expect(res.status).toBe(404);
  });
});

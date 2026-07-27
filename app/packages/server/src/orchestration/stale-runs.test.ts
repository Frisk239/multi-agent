import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  getIssueIdleMs,
  getIssueToolIdleMs,
  getIssueWallTimeoutMs,
  getWaitingLocalMaxMs,
  getDeferredUnclaimedMs,
  getPrepareLeaseMs,
  formatDurationMs,
  failStaleWaitingLocalDirectoryRuns,
  failStalePrepareLeaseRuns,
  escalateDeferredUnclaimedRuns,
  STALE_RUNNING_MS,
  DEFAULT_ISSUE_IDLE_MS,
  DEFAULT_OPENCODE_IDLE_MS,
  DEFAULT_ISSUE_TOOL_IDLE_MS,
  DEFAULT_WAITING_LOCAL_MAX_MS,
  DEFAULT_PREPARE_LEASE_MS,
} from './stale-runs';

const mocks = vi.hoisted(() => ({
  selectAll: vi.fn(),
  selectGet: vi.fn(),
  updateSet: vi.fn(),
  updateWhereRun: vi.fn(),
  insertValues: vi.fn(),
  insertRun: vi.fn(),
  publish: vi.fn(),
  notifyRunTerminal: vi.fn(),
  notifyDeferredUnclaimed: vi.fn(),
  notifySquadEscalated: vi.fn(),
  toAgentRun: vi.fn((row: any) => row),
  lastFromTable: null as any,
}));

vi.mock('../db/client.js', () => {
  return {
    db: {
      select: () => ({
        from: (table: any) => {
          mocks.lastFromTable = table;
          return {
            where: () => ({
              all: (...args: any[]) => {
                // activityLogs queries vs agentRuns: use same selectAll; tests sequence returns
                return mocks.selectAll(...args);
              },
              get: mocks.selectGet,
            }),
          };
        },
      }),
      update: () => ({
        set: (vals: any) => {
          mocks.updateSet(vals);
          return {
            where: () => ({
              run: () => {
                mocks.updateWhereRun();
                return { changes: 1 };
              },
            }),
          };
        },
      }),
      insert: () => ({
        values: (vals: any) => {
          mocks.insertValues(vals);
          return {
            run: () => {
              mocks.insertRun();
              return { changes: 1 };
            },
          };
        },
      }),
    },
  };
});

vi.mock('../db/schema.js', () => ({
  agentRuns: {
    id: 'id',
    status: 'status',
  },
  agents: {},
  activityLogs: {
    issueId: 'issueId',
    eventType: 'eventType',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
  isNotNull: vi.fn((...args: unknown[]) => args),
}));

vi.mock('../db/reshape.js', () => ({
  toAgentRun: (row: any) => mocks.toAgentRun(row),
}));

vi.mock('./event-bus.js', () => ({
  eventBus: {
    publish: (...args: any[]) => mocks.publish(...args),
  },
}));

vi.mock('./inbox-writer.js', () => ({
  notifyRunTerminal: (...args: any[]) => mocks.notifyRunTerminal(...args),
  notifySquadEscalated: (...args: any[]) => mocks.notifySquadEscalated(...args),
  notifyDeferredUnclaimed: (...args: any[]) => mocks.notifyDeferredUnclaimed(...args),
}));

vi.mock('./run-control.js', () => ({
  abortRun: vi.fn(),
  hasRunAbort: vi.fn(),
}));

vi.mock('./tool-watchdog-state.js', () => ({
  clearToolInflight: vi.fn(),
  getToolInflight: vi.fn(() => ({ depth: 0, lastToolName: null })),
}));

vi.mock('../logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('stale-runs configuration and helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exports expected default timeout constants', () => {
    expect(STALE_RUNNING_MS).toBe(120_000);
    expect(DEFAULT_ISSUE_IDLE_MS).toBe(30 * 60_000);
    expect(DEFAULT_OPENCODE_IDLE_MS).toBe(10 * 60_000);
    expect(DEFAULT_ISSUE_TOOL_IDLE_MS).toBe(2 * 60 * 60_000);
    expect(DEFAULT_WAITING_LOCAL_MAX_MS).toBe(2 * 60 * 60_000);
    expect(DEFAULT_PREPARE_LEASE_MS).toBe(120_000);
  });

  it('getIssueIdleMs returns default or opencode specific idle timeout', () => {
    expect(getIssueIdleMs('claude-code')).toBe(DEFAULT_ISSUE_IDLE_MS);
    expect(getIssueIdleMs('opencode')).toBe(DEFAULT_OPENCODE_IDLE_MS);

    vi.stubEnv('MA_ISSUE_IDLE_MS', '600000');
    expect(getIssueIdleMs('claude-code')).toBe(600_000);

    vi.stubEnv('MA_OPENCODE_IDLE_MS', '300000');
    expect(getIssueIdleMs('opencode')).toBe(300_000);
  });

  it('getIssueToolIdleMs returns tool idle window', () => {
    expect(getIssueToolIdleMs()).toBe(DEFAULT_ISSUE_TOOL_IDLE_MS);

    vi.stubEnv('MA_ISSUE_TOOL_IDLE_MS', '3600000');
    expect(getIssueToolIdleMs()).toBe(3_600_000);
  });

  it('getIssueWallTimeoutMs defaults to 0 (disabled)', () => {
    expect(getIssueWallTimeoutMs()).toBe(0);

    vi.stubEnv('MA_ISSUE_TIMEOUT_MS', '7200000');
    expect(getIssueWallTimeoutMs()).toBe(7_200_000);
  });

  it('getWaitingLocalMaxMs defaults to 2h and is configurable', () => {
    expect(getWaitingLocalMaxMs()).toBe(DEFAULT_WAITING_LOCAL_MAX_MS);

    vi.stubEnv('MA_WAITING_LOCAL_MAX_MS', '1800000');
    expect(getWaitingLocalMaxMs()).toBe(1_800_000);

    vi.stubEnv('MA_WAITING_LOCAL_MAX_MS', '0');
    expect(getWaitingLocalMaxMs()).toBe(0);
  });

  it('getDeferredUnclaimedMs defaults to 0 (disabled) and is configurable', () => {
    expect(getDeferredUnclaimedMs()).toBe(0);

    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', '1800000');
    expect(getDeferredUnclaimedMs()).toBe(1_800_000);

    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', '0');
    expect(getDeferredUnclaimedMs()).toBe(0);
  });

  it('getPrepareLeaseMs defaults to 120s and is configurable (Slice 68)', () => {
    expect(getPrepareLeaseMs()).toBe(DEFAULT_PREPARE_LEASE_MS);

    vi.stubEnv('MA_PREPARE_LEASE_MS', '90000');
    expect(getPrepareLeaseMs()).toBe(90_000);

    vi.stubEnv('MA_PREPARE_LEASE_MS', '0');
    expect(getPrepareLeaseMs()).toBe(0);
  });

  it('formatDurationMs formats ms into human-readable strings', () => {
    expect(formatDurationMs(500)).toBe('1s');
    expect(formatDurationMs(5_000)).toBe('5s');
    expect(formatDurationMs(65_000)).toBe('1m');
    expect(formatDurationMs(3600_000)).toBe('1.0h');
  });
});

describe('failStalePrepareLeaseRuns (Slice 68)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails running rows with expired prepareLeaseExpiresAt', () => {
    const now = 10_000_000;
    const row = {
      id: 'run-half-claim',
      status: 'running',
      prepareLeaseExpiresAt: now - 1,
      agentId: 'agt-1',
      kind: 'issue',
      issueId: 'iss-1',
      createdAt: now - 200_000,
    };
    mocks.selectAll.mockReturnValue([row]);
    mocks.selectGet.mockReturnValue({
      ...row,
      status: 'failed',
      finishedAt: now,
      error: 'stale: prepare_lease expired (claim never reached stable running)',
      failureReason: 'exec_error',
      prepareLeaseExpiresAt: null,
    });

    const n = failStalePrepareLeaseRuns(now);
    expect(n).toBe(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: 'exec_error',
        error: expect.stringContaining('prepare_lease'),
        prepareLeaseExpiresAt: null,
      }),
    );
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run:failed' }),
    );
    expect(mocks.notifyRunTerminal).toHaveBeenCalledTimes(1);
  });

  it('skips running rows with null lease (stable) or unexpired lease', () => {
    const now = 10_000_000;
    mocks.selectAll.mockReturnValue([
      {
        id: 'run-stable',
        status: 'running',
        prepareLeaseExpiresAt: null,
      },
      {
        id: 'run-fresh-lease',
        status: 'running',
        prepareLeaseExpiresAt: now + 60_000,
      },
    ]);

    expect(failStalePrepareLeaseRuns(now)).toBe(0);
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

describe('failStaleWaitingLocalDirectoryRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails waiting_local_directory runs older than wall max with clear failureReason', () => {
    const now = 10_000_000;
    const oldCreatedAt = now - DEFAULT_WAITING_LOCAL_MAX_MS - 1;
    const row = {
      id: 'run-wait-old',
      status: 'waiting_local_directory',
      createdAt: oldCreatedAt,
      agentId: 'agt-1',
      kind: 'issue',
      issueId: 'iss-1',
    };
    mocks.selectAll.mockReturnValue([row]);
    mocks.selectGet.mockReturnValue({
      ...row,
      status: 'timed_out',
      finishedAt: now,
      error: `stale: waiting_local_directory exceeded wall clock (${formatDurationMs(DEFAULT_WAITING_LOCAL_MAX_MS)})`,
      failureReason: 'waiting_local_directory_timeout',
    });

    const n = failStaleWaitingLocalDirectoryRuns(now);
    expect(n).toBe(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'timed_out',
        finishedAt: now,
        failureReason: 'waiting_local_directory_timeout',
        error: expect.stringContaining('waiting_local_directory'),
        waitingLocalEnteredAt: null,
      }),
    );
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run:failed' }),
    );
    expect(mocks.notifyRunTerminal).toHaveBeenCalledTimes(1);
  });

  it('does not fail recent waiting_local_directory runs (short path-lock wait safe)', () => {
    const now = 10_000_000;
    const recent = {
      id: 'run-wait-fresh',
      status: 'waiting_local_directory',
      createdAt: now - 60_000, // 1 minute
      agentId: 'agt-1',
      kind: 'issue',
      issueId: 'iss-1',
    };
    mocks.selectAll.mockReturnValue([recent]);

    const n = failStaleWaitingLocalDirectoryRuns(now);
    expect(n).toBe(0);
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.notifyRunTerminal).not.toHaveBeenCalled();
  });

  it('skips when MA_WAITING_LOCAL_MAX_MS=0', () => {
    vi.stubEnv('MA_WAITING_LOCAL_MAX_MS', '0');
    mocks.selectAll.mockReturnValue([
      {
        id: 'run-wait-old',
        status: 'waiting_local_directory',
        createdAt: 1,
      },
    ]);
    expect(failStaleWaitingLocalDirectoryRuns(Date.now())).toBe(0);
    expect(mocks.selectAll).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });
});

describe('escalateDeferredUnclaimedRuns (Slice 42 D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.notifyDeferredUnclaimed.mockReturnValue({ id: 'inbox-1' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no-ops when MA_DEFERRED_UNCLAIMED_MS=0 (default)', () => {
    expect(getDeferredUnclaimedMs()).toBe(0);
    mocks.selectAll.mockReturnValue([
      {
        id: 'run-old',
        status: 'queued',
        createdAt: 1,
        startedAt: null,
        issueId: 'iss-1',
        agentId: 'agt-1',
      },
    ]);
    expect(escalateDeferredUnclaimedRuns(10_000_000)).toBe(0);
    expect(mocks.selectAll).not.toHaveBeenCalled();
    expect(mocks.notifyDeferredUnclaimed).not.toHaveBeenCalled();
    expect(mocks.notifySquadEscalated).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('escalates only aged queued runs (inject now); writes activity + deferred inbox', () => {
    const threshold = 30 * 60_000;
    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', String(threshold));
    const now = 10_000_000;
    const oldQueued = {
      id: 'run-queued-old',
      status: 'queued',
      createdAt: now - threshold - 1,
      startedAt: null,
      issueId: 'iss-1',
      agentId: 'agt-1',
      kind: 'issue',
    };
    const freshQueued = {
      id: 'run-queued-fresh',
      status: 'queued',
      createdAt: now - 1_000,
      startedAt: null,
      issueId: 'iss-1',
      agentId: 'agt-1',
      kind: 'issue',
    };

    // 1st all(): agentRuns candidates; 2nd all(): activityLogs for oldQueued (empty)
    mocks.selectAll
      .mockReturnValueOnce([oldQueued, freshQueued])
      .mockReturnValueOnce([]);

    const n = escalateDeferredUnclaimedRuns(now);
    expect(n).toBe(1);
    expect(mocks.notifyDeferredUnclaimed).toHaveBeenCalledTimes(1);
    expect(mocks.notifyDeferredUnclaimed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-queued-old', status: 'queued' }),
      { thresholdMs: threshold },
    );
    expect(mocks.notifySquadEscalated).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'iss-1',
        eventType: 'run_deferred',
        actorType: 'system',
        payload: expect.stringContaining('run-queued-old'),
      }),
    );
  });

  it('skips runs that already have run_deferred activity (dedupe)', () => {
    const threshold = 60_000;
    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', String(threshold));
    const now = 5_000_000;
    const oldQueued = {
      id: 'run-dup',
      status: 'queued',
      createdAt: now - threshold - 10,
      startedAt: null,
      issueId: 'iss-2',
      agentId: 'agt-2',
      kind: 'issue',
    };
    mocks.selectAll
      .mockReturnValueOnce([oldQueued])
      .mockReturnValueOnce([
        {
          id: 'act-1',
          issueId: 'iss-2',
          eventType: 'run_deferred',
          payload: JSON.stringify({ runId: 'run-dup' }),
        },
      ]);

    expect(escalateDeferredUnclaimedRuns(now)).toBe(0);
    expect(mocks.notifyDeferredUnclaimed).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('skips queued rows that already have startedAt (not unclaimed)', () => {
    const threshold = 60_000;
    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', String(threshold));
    const now = 5_000_000;
    mocks.selectAll.mockReturnValueOnce([
      {
        id: 'run-claimed-once',
        status: 'queued',
        createdAt: now - threshold - 10,
        startedAt: now - threshold,
        issueId: 'iss-3',
        agentId: 'agt-3',
        kind: 'issue',
      },
    ]);

    expect(escalateDeferredUnclaimedRuns(now)).toBe(0);
    expect(mocks.notifyDeferredUnclaimed).not.toHaveBeenCalled();
  });

  it('does not use Squad Escalated path or mutate run status', () => {
    const threshold = 1_000;
    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', String(threshold));
    const now = 100_000;
    mocks.selectAll
      .mockReturnValueOnce([
        {
          id: 'run-d',
          status: 'queued',
          createdAt: now - threshold - 1,
          startedAt: null,
          issueId: 'iss-d',
          agentId: 'agt-d',
          kind: 'issue',
        },
      ])
      .mockReturnValueOnce([]);

    escalateDeferredUnclaimedRuns(now);
    expect(mocks.notifySquadEscalated).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
    const payload = mocks.insertValues.mock.calls[0]?.[0]?.payload as string;
    expect(payload).not.toContain('Squad Escalated');
    expect(payload).toContain('queued_unclaimed');
  });
});

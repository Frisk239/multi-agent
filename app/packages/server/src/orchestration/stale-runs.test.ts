import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  getIssueIdleMs,
  getIssueToolIdleMs,
  getIssueWallTimeoutMs,
  getWaitingLocalMaxMs,
  getDeferredUnclaimedMs,
  isDeferredAutoEscalateOptIn,
  getPrepareLeaseMs,
  formatDurationMs,
  failStaleWaitingLocalDirectoryRuns,
  failStalePrepareLeaseRuns,
  recoverOrphanedRunningRuns,
  escalateDeferredUnclaimedRuns,
  STALE_RUNNING_MS,
  DEFAULT_ISSUE_IDLE_MS,
  DEFAULT_OPENCODE_IDLE_MS,
  DEFAULT_ISSUE_TOOL_IDLE_MS,
  DEFAULT_WAITING_LOCAL_MAX_MS,
  DEFAULT_PREPARE_LEASE_MS,
  SUGGESTED_DEFERRED_UNCLAIMED_MS,
} from './stale-runs';

const mocks = vi.hoisted(() => ({
  selectAll: vi.fn(),
  selectGet: vi.fn(),
  updateSet: vi.fn(),
  updateWhereRun: vi.fn(),
  insertValues: vi.fn(),
  insertRun: vi.fn(),
  publish: vi.fn(),
  abortRun: vi.fn(),
  hasRunAbort: vi.fn(),
  notifyRunTerminal: vi.fn(),
  notifyDeferredUnclaimed: vi.fn(),
  notifySquadEscalated: vi.fn(),
  getExecutionOwnership: vi.fn(),
  verifyExecutionOwnership: vi.fn(),
  clearExecutionOwnership: vi.fn(),
  killProcessTree: vi.fn((_pid: number) => ({ attempted: true, taskkill: false })),
  toAgentRun: vi.fn((row: any) => row),
  lastFromTable: null as any,
  readInboxPrefs: vi.fn((): any => ({
    notifyIssueSuccess: false,
    notifyTypes: {},
    notifySeverities: {},
    deferredAutoEscalate: false,
  })),
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
  // G6-4：escalateFailedSquadRuns 用 sql 模板谓词（COALESCE NOT LIKE）；mock 仅占位
  sql: (() => 'sql') as unknown as typeof import('drizzle-orm').sql,
}));

vi.mock('../db/reshape.js', () => ({
  toAgentRun: (row: any) => mocks.toAgentRun(row),
  toObservedAgentRun: (row: any) => mocks.toAgentRun(row),
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

vi.mock('./inbox-prefs.js', () => ({
  readInboxPrefs: () => mocks.readInboxPrefs(),
  writeInboxPrefs: vi.fn(),
  shouldNotifyIssueSuccess: vi.fn(() => false),
}));

vi.mock('./run-control.js', () => ({
  abortRun: (...args: unknown[]) => mocks.abortRun(...args),
  hasRunAbort: (...args: unknown[]) => mocks.hasRunAbort(...args),
}));

vi.mock('./execution-ownership.js', () => ({
  getExecutionOwnership: (runId: string) => mocks.getExecutionOwnership(runId),
  verifyExecutionOwnership: (row: unknown) => mocks.verifyExecutionOwnership(row),
  clearExecutionOwnership: (runId: string) => mocks.clearExecutionOwnership(runId),
}));

vi.mock('../runtime/process-tree.js', () => ({
  killProcessTree: (pid: number) => mocks.killProcessTree(pid),
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
    mocks.readInboxPrefs.mockReturnValue({ deferredAutoEscalate: false });
    expect(getDeferredUnclaimedMs()).toBe(0);
    expect(isDeferredAutoEscalateOptIn()).toBe(false);

    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', '1800000');
    expect(getDeferredUnclaimedMs()).toBe(1_800_000);

    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', '0');
    expect(getDeferredUnclaimedMs()).toBe(0);
  });

  it('Slice 70: MA_DEFERRED_AUTO_ESCALATE opt-in uses suggested 30min when MS unset', () => {
    mocks.readInboxPrefs.mockReturnValue({ deferredAutoEscalate: false });
    vi.stubEnv('MA_DEFERRED_AUTO_ESCALATE', '1');
    expect(isDeferredAutoEscalateOptIn()).toBe(true);
    expect(getDeferredUnclaimedMs()).toBe(SUGGESTED_DEFERRED_UNCLAIMED_MS);
  });

  it('Slice 70: prefs deferredAutoEscalate opt-in without env', () => {
    mocks.readInboxPrefs.mockReturnValue({ deferredAutoEscalate: true });
    expect(isDeferredAutoEscalateOptIn()).toBe(true);
    expect(getDeferredUnclaimedMs()).toBe(SUGGESTED_DEFERRED_UNCLAIMED_MS);
  });

  it('Slice 70: explicit MA_DEFERRED_UNCLAIMED_MS wins over suggested', () => {
    mocks.readInboxPrefs.mockReturnValue({ deferredAutoEscalate: true });
    vi.stubEnv('MA_DEFERRED_UNCLAIMED_MS', '60000');
    expect(getDeferredUnclaimedMs()).toBe(60_000);
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

describe('recoverOrphanedRunningRuns (G5-4 重启 orphan / 取消中崩溃语义)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.hasRunAbort.mockReturnValue(false); // 崩溃后注册表为空
    mocks.getExecutionOwnership.mockReturnValue(undefined);
    mocks.verifyExecutionOwnership.mockReturnValue({
      verified: false,
      reason: 'missing_owner',
      pid: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DB running + 无 owner 条目 → visible unknown，绝不按 PID 盲杀', () => {
    const now = 10_000_000;
    const row = {
      id: 'run-orphan-1',
      status: 'running',
      agentId: 'agt-1',
      kind: 'issue',
      issueId: 'iss-1',
      attempt: 1,
      maxAttempts: 2,
    };
    mocks.selectAll.mockReturnValue([row]);
    mocks.selectGet.mockReturnValue({ ...row, status: 'failed' });

    const n = recoverOrphanedRunningRuns(now);
    expect(n).toBe(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: 'unknown_external_execution',
        error: expect.stringContaining('not terminated automatically'),
      }),
    );
    expect(mocks.killProcessTree).not.toHaveBeenCalled();
    expect(mocks.clearExecutionOwnership).toHaveBeenCalledWith('run-orphan-1');
  });

  it('only requests tree termination after a complete ownership match', () => {
    const now = 10_000_000;
    const row = {
      id: 'run-verified-owner', status: 'running', agentId: 'agt-1', kind: 'issue', issueId: 'iss-1',
      attempt: 1, maxAttempts: 2,
    };
    mocks.selectAll.mockReturnValue([row]);
    mocks.selectGet.mockReturnValue({ ...row, status: 'failed' });
    mocks.getExecutionOwnership.mockReturnValue({ runId: row.id, pid: 4242, fingerprint: 'same' });
    mocks.verifyExecutionOwnership.mockReturnValue({ verified: true, pid: 4242 });

    expect(recoverOrphanedRunningRuns(now)).toBe(1);
    expect(mocks.killProcessTree).toHaveBeenCalledWith(4242);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      failureReason: 'orphan_termination_attempted',
      error: expect.stringContaining('termination requested'),
    }));
    expect(mocks.clearExecutionOwnership).toHaveBeenCalledWith(row.id);
  });

  it('does not kill a PID whose persisted fingerprint no longer matches', () => {
    const now = 10_000_000;
    const row = {
      id: 'run-reused-pid', status: 'running', agentId: 'agt-1', kind: 'issue', issueId: 'iss-1',
      attempt: 1, maxAttempts: 2,
    };
    mocks.selectAll.mockReturnValue([row]);
    mocks.selectGet.mockReturnValue({ ...row, status: 'failed' });
    mocks.getExecutionOwnership.mockReturnValue({ runId: row.id, pid: 4242, fingerprint: 'old' });
    mocks.verifyExecutionOwnership.mockReturnValue({
      verified: false, reason: 'fingerprint_mismatch', pid: 4242,
    });

    expect(recoverOrphanedRunningRuns(now)).toBe(1);
    expect(mocks.killProcessTree).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      failureReason: 'unknown_external_execution',
      error: expect.stringContaining('fingerprint_mismatch'),
    }));
  });

  it('DB running + 仍有 abort 条目（活 executor）→ 跳过不终态化', () => {
    const now = 10_000_000;
    const row = {
      id: 'run-live-1',
      status: 'running',
      agentId: 'agt-1',
      kind: 'issue',
      issueId: 'iss-1',
    };
    mocks.selectAll.mockReturnValue([row]);
    mocks.hasRunAbort.mockReturnValue(true);
    const n = recoverOrphanedRunningRuns(now);
    expect(n).toBe(0);
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });

  it('取消中崩溃场景：DB 已终态（cancel UPDATE 先提交）→ recover 只查 running，不碰终态行', () => {
    // mock 的 selectAll 仅返回 running 行（真实 SQL 按 status 过滤）；
    // 断言 recover 不会对终态行做任何终态化（updateSet 未被调用）
    mocks.selectAll.mockReturnValue([]);
    const n = recoverOrphanedRunningRuns(10_000_000);
    expect(n).toBe(0);
    expect(mocks.updateSet).not.toHaveBeenCalled();
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

describe('escalateDeferredUnclaimedRuns (Slice 42 D5 + Slice 70)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.notifyDeferredUnclaimed.mockReturnValue({ id: 'inbox-1' });
    mocks.readInboxPrefs.mockReturnValue({ deferredAutoEscalate: false });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no-ops when deferred escalate disabled (default)', () => {
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

  it('escalates only aged queued runs (inject now); 转 deferred + fire_at + activity + inbox', () => {
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
    // then transitionRun: update().set(deferred+fireAt).run() → changes:1, select().get() → deferred row
    mocks.selectAll
      .mockReturnValueOnce([oldQueued, freshQueued])
      .mockReturnValueOnce([]);
    mocks.selectGet.mockReturnValue({
      ...oldQueued,
      status: 'deferred',
      fireAt: now + 5 * 60_000,
    });

    const n = escalateDeferredUnclaimedRuns(now);
    expect(n).toBe(1);
    // G2-1：queued → deferred + fire_at 宽限窗（不再停留在 queued）
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'deferred',
        fireAt: now + 5 * 60_000,
      }),
    );
    expect(mocks.notifyDeferredUnclaimed).toHaveBeenCalledTimes(1);
    expect(mocks.notifyDeferredUnclaimed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-queued-old', status: 'deferred' }),
      {
        thresholdMs: threshold,
        reassignDraft: {
          note: expect.stringContaining('宽限后将自动升级'),
          agentId: 'agt-1',
          applied: false,
        },
      },
    );
    expect(mocks.notifySquadEscalated).not.toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'iss-1',
        eventType: 'run_deferred',
        actorType: 'system',
        payload: expect.stringContaining('run-queued-old'),
      }),
    );
    const payload = mocks.insertValues.mock.calls[0]?.[0]?.payload as string;
    expect(payload).toContain('宽限后将自动升级');
    expect(payload).toContain('"applied":false');
    expect(payload).toContain('"deferred":true');
  });

  it('Slice 70: prefs autoEscalate opt-in path writes inbox without env MS', () => {
    mocks.readInboxPrefs.mockReturnValue({ deferredAutoEscalate: true });
    const threshold = SUGGESTED_DEFERRED_UNCLAIMED_MS;
    const now = 20_000_000;
    const oldQueued = {
      id: 'run-prefs-optin',
      status: 'queued',
      createdAt: now - threshold - 5,
      startedAt: null,
      issueId: 'iss-prefs',
      agentId: 'agt-prefs',
      kind: 'issue',
    };
    mocks.selectAll.mockReturnValueOnce([oldQueued]).mockReturnValueOnce([]);
    mocks.selectGet.mockReturnValue({
      ...oldQueued,
      status: 'deferred',
      fireAt: now + 5 * 60_000,
    });

    const n = escalateDeferredUnclaimedRuns(now);
    expect(n).toBe(1);
    expect(mocks.notifyDeferredUnclaimed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-prefs-optin' }),
      expect.objectContaining({
        thresholdMs: threshold,
        reassignDraft: expect.objectContaining({ applied: false }),
      }),
    );
    // G2-1：转 deferred + fire_at；不真改派（set 不含 agentId/assignee 变更）
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'deferred' }),
    );
    expect(mocks.updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ agentId: expect.anything() }),
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

  it('does not use Squad Escalated path; 转 deferred 而非直接 fail', () => {
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
    mocks.selectGet.mockReturnValue({
      id: 'run-d',
      status: 'deferred',
      fireAt: now + 5 * 60_000,
      issueId: 'iss-d',
      agentId: 'agt-d',
      kind: 'issue',
    });

    escalateDeferredUnclaimedRuns(now);
    expect(mocks.notifySquadEscalated).not.toHaveBeenCalled();
    // 转 deferred（含 fire_at），不是硬 fail
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'deferred' }),
    );
    expect(mocks.updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
    const payload = mocks.insertValues.mock.calls[0]?.[0]?.payload as string;
    expect(payload).not.toContain('Squad Escalated');
    expect(payload).toContain('queued_unclaimed');
    expect(payload).toContain('"deferred":true');
  });
});

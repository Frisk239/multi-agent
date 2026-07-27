import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  getIssueIdleMs,
  getIssueToolIdleMs,
  getIssueWallTimeoutMs,
  getWaitingLocalMaxMs,
  formatDurationMs,
  failStaleWaitingLocalDirectoryRuns,
  STALE_RUNNING_MS,
  DEFAULT_ISSUE_IDLE_MS,
  DEFAULT_OPENCODE_IDLE_MS,
  DEFAULT_ISSUE_TOOL_IDLE_MS,
  DEFAULT_WAITING_LOCAL_MAX_MS,
} from './stale-runs';

const mocks = vi.hoisted(() => ({
  selectAll: vi.fn(),
  selectGet: vi.fn(),
  updateSet: vi.fn(),
  updateWhereRun: vi.fn(),
  publish: vi.fn(),
  notifyRunTerminal: vi.fn(),
  toAgentRun: vi.fn((row: any) => row),
}));

vi.mock('../db/client.js', () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            all: mocks.selectAll,
            get: mocks.selectGet,
          }),
        }),
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
    },
  };
});

vi.mock('../db/schema.js', () => ({
  agentRuns: {
    id: 'id',
    status: 'status',
  },
  agents: {},
  activityLogs: {},
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
  notifySquadEscalated: vi.fn(),
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

  it('formatDurationMs formats ms into human-readable strings', () => {
    expect(formatDurationMs(500)).toBe('1s');
    expect(formatDurationMs(5_000)).toBe('5s');
    expect(formatDurationMs(65_000)).toBe('1m');
    expect(formatDurationMs(3600_000)).toBe('1.0h');
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

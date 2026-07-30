import { describe, expect, it } from 'vitest';
import { calculateDay0Progress, calculateRunHealth } from './settings.js';

describe('calculateDay0Progress', () => {
  const base = {
    agents: [{ archivedAt: null }, { archivedAt: 1 }],
    projects: [{ localPath: 'D:\\repo' }],
    issues: [{ id: 'i-1', identifier: 'FRI-1', assigneeType: 'agent', assigneeId: 'a-1' }],
    runs: [
      { id: 'r-old', issueId: 'i-1', status: 'completed', createdAt: 1 },
      { id: 'r-live', issueId: 'i-1', status: 'running', createdAt: 2 },
    ],
    hasRuntimes: true,
    isUsableProjectPath: (path: string) => path === 'D:\\repo',
  };

  it('requires all real conditions and prefers the active linked run', () => {
    expect(calculateDay0Progress(base)).toMatchObject({
      activeAgentCount: 1,
      validProjectCount: 1,
      firstRunId: 'r-live',
      completed: true,
    });
  });

  it('does not complete for invalid project or unassigned issue', () => {
    expect(calculateDay0Progress({
      ...base,
      projects: [{ localPath: 'D:\\missing' }],
      issues: [{ ...base.issues[0]!, assigneeType: null, assigneeId: null }],
    })).toMatchObject({
      hasValidProject: false,
      hasAssignedIssueRun: false,
      completed: false,
    });
  });
});

describe('calculateRunHealth', () => {
  const thresholds = {
    issueIdleMs: 30_000,
    issueWallTimeoutMs: 0,
    waitingLocalMaxMs: 10_000,
  };

  it('counts waiting runs and uses waitingLocalEnteredAt for age/risk', () => {
    const health = calculateRunHealth(
      [
        { status: 'queued', createdAt: 9_000, startedAt: null, lastHeartbeatAt: null, waitingLocalEnteredAt: null, kind: 'issue' },
        { status: 'waiting_local_directory', createdAt: 1_000, startedAt: null, lastHeartbeatAt: null, waitingLocalEnteredAt: 0, kind: 'issue' },
        { status: 'running', createdAt: 8_000, startedAt: 9_000, lastHeartbeatAt: 9_500, waitingLocalEnteredAt: null, kind: 'issue' },
      ] as any,
      10_000,
      thresholds,
    );

    expect(health.active).toEqual({ total: 3, queued: 1, waitingLocalDirectory: 1, running: 1 });
    expect(health.oldestWaitingLocalDirectoryAgeMs).toBe(10_000);
    expect(health.atRisk.waitingLocalNearStale).toBe(1);
  });

  it('does not mark waiting runs near-stale when its wall limit is disabled', () => {
    const health = calculateRunHealth(
      [{ status: 'waiting_local_directory', createdAt: 0, startedAt: null, lastHeartbeatAt: null, waitingLocalEnteredAt: 0, kind: 'issue' }] as any,
      1_000_000,
      { ...thresholds, waitingLocalMaxMs: 0 },
    );
    expect(health.atRisk.waitingLocalNearStale).toBe(0);
  });
});

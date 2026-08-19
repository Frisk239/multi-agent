import { describe, expect, it } from 'vitest';
import {
  collectActiveIssueIds,
  collectWaitingOnlyIssueIds,
  deriveIssueCardLive,
  issueIdsFromRuns,
} from './issue-card-live';

describe('deriveIssueCardLive', () => {
  it('is quiet when no runs', () => {
    expect(deriveIssueCardLive({})).toEqual({
      live: false,
      waiting: false,
      liveKind: null,
      failed: false,
      showFailed: false,
    });
    expect(
      deriveIssueCardLive({ activeRuns: false, recentFailed: false }),
    ).toEqual({
      live: false,
      waiting: false,
      liveKind: null,
      failed: false,
      showFailed: false,
    });
    expect(
      deriveIssueCardLive({ activeRuns: 0, recentFailed: [] }),
    ).toEqual({
      live: false,
      waiting: false,
      liveKind: null,
      failed: false,
      showFailed: false,
    });
  });

  it('marks live when active (boolean / count / array)', () => {
    expect(deriveIssueCardLive({ activeRuns: true }).live).toBe(true);
    expect(deriveIssueCardLive({ activeRuns: true }).liveKind).toBe('running');
    expect(deriveIssueCardLive({ activeRuns: 2 }).live).toBe(true);
    expect(deriveIssueCardLive({ activeRuns: [{}] }).live).toBe(true);
  });

  it('marks waiting liveKind when waitingRuns and active', () => {
    const waiting = deriveIssueCardLive({
      activeRuns: true,
      waitingRuns: true,
    });
    expect(waiting).toEqual({
      live: true,
      waiting: true,
      liveKind: 'waiting',
      failed: false,
      showFailed: false,
    });

    // waiting flag alone without active → not live (caller must include waiting in active)
    expect(
      deriveIssueCardLive({ activeRuns: false, waitingRuns: true }),
    ).toEqual({
      live: false,
      waiting: false,
      liveKind: null,
      failed: false,
      showFailed: false,
    });
  });

  it('marks showFailed only when failed and not live', () => {
    const onlyFailed = deriveIssueCardLive({
      activeRuns: false,
      recentFailed: true,
    });
    expect(onlyFailed).toEqual({
      live: false,
      waiting: false,
      liveKind: null,
      failed: true,
      showFailed: true,
    });

    const both = deriveIssueCardLive({
      activeRuns: true,
      recentFailed: true,
    });
    expect(both).toEqual({
      live: true,
      waiting: false,
      liveKind: 'running',
      failed: true,
      showFailed: false,
    });
  });

  it('treats nullish as absent', () => {
    expect(
      deriveIssueCardLive({ activeRuns: null, recentFailed: undefined }),
    ).toEqual({
      live: false,
      waiting: false,
      liveKind: null,
      failed: false,
      showFailed: false,
    });
  });
});

describe('issueIdsFromRuns / collectActiveIssueIds', () => {
  it('collects unique issue ids, skips empty', () => {
    const set = issueIdsFromRuns([
      { issueId: 'a' },
      { issueId: null },
      { issueId: 'a' },
      { issueId: 'b' },
      {},
    ]);
    expect([...set].sort()).toEqual(['a', 'b']);
    expect(issueIdsFromRuns(null).size).toBe(0);
    expect(issueIdsFromRuns(undefined).size).toBe(0);
  });

  it('merges running + queued + waiting lists for active coverage', () => {
    const active = collectActiveIssueIds(
      [{ issueId: 'i1' }, { issueId: null }],
      [{ issueId: 'i2' }, { issueId: 'i1' }],
      [{ issueId: 'i3' }],
      null,
    );
    expect(active.has('i1')).toBe(true);
    expect(active.has('i2')).toBe(true);
    expect(active.has('i3')).toBe(true);
    expect(active.size).toBe(3);
  });
});

describe('collectWaitingOnlyIssueIds (G8-1)', () => {
  it('includes waiting issues not covered by running/queued', () => {
    const only = collectWaitingOnlyIssueIds(
      [{ issueId: 'wait-a' }, { issueId: 'both' }, { issueId: null }],
      [{ issueId: 'run-b' }, { issueId: 'both' }],
      [{ issueId: 'queue-c' }],
    );
    expect(only.has('wait-a')).toBe(true);
    expect(only.has('both')).toBe(false);
    expect(only.has('run-b')).toBe(false);
    expect(only.has('queue-c')).toBe(false);
    expect(only.size).toBe(1);
  });

  it('handles empty inputs', () => {
    expect(collectWaitingOnlyIssueIds(null).size).toBe(0);
    expect(collectWaitingOnlyIssueIds(undefined, [{ issueId: 'x' }]).size).toBe(0);
    expect(collectWaitingOnlyIssueIds([{ issueId: 'w' }]).has('w')).toBe(true);
  });
});

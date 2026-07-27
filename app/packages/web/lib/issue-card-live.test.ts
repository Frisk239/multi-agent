import { describe, expect, it } from 'vitest';
import {
  collectActiveIssueIds,
  deriveIssueCardLive,
  issueIdsFromRuns,
} from './issue-card-live';

describe('deriveIssueCardLive', () => {
  it('is quiet when no runs', () => {
    expect(deriveIssueCardLive({})).toEqual({
      live: false,
      failed: false,
      showFailed: false,
    });
    expect(
      deriveIssueCardLive({ activeRuns: false, recentFailed: false }),
    ).toEqual({ live: false, failed: false, showFailed: false });
    expect(
      deriveIssueCardLive({ activeRuns: 0, recentFailed: [] }),
    ).toEqual({ live: false, failed: false, showFailed: false });
  });

  it('marks live when active (boolean / count / array)', () => {
    expect(deriveIssueCardLive({ activeRuns: true }).live).toBe(true);
    expect(deriveIssueCardLive({ activeRuns: 2 }).live).toBe(true);
    expect(deriveIssueCardLive({ activeRuns: [{}] }).live).toBe(true);
  });

  it('marks showFailed only when failed and not live', () => {
    const onlyFailed = deriveIssueCardLive({
      activeRuns: false,
      recentFailed: true,
    });
    expect(onlyFailed).toEqual({
      live: false,
      failed: true,
      showFailed: true,
    });

    const both = deriveIssueCardLive({
      activeRuns: true,
      recentFailed: true,
    });
    expect(both).toEqual({
      live: true,
      failed: true,
      showFailed: false,
    });
  });

  it('treats nullish as absent', () => {
    expect(
      deriveIssueCardLive({ activeRuns: null, recentFailed: undefined }),
    ).toEqual({ live: false, failed: false, showFailed: false });
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

  it('merges running + queued lists for active coverage', () => {
    const active = collectActiveIssueIds(
      [{ issueId: 'i1' }, { issueId: null }],
      [{ issueId: 'i2' }, { issueId: 'i1' }],
      null,
    );
    expect(active.has('i1')).toBe(true);
    expect(active.has('i2')).toBe(true);
    expect(active.size).toBe(2);
  });
});

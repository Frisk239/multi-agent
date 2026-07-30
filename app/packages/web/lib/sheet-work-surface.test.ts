import { describe, expect, it } from 'vitest';
import { buildSheetFailCta, buildSheetStorylineSummary } from './sheet-work-surface';

describe('buildSheetStorylineSummary', () => {
  it('summarizes counts', () => {
    expect(
      buildSheetStorylineSummary({ commentCount: 2, runCount: 1, activityCount: 3 }),
    ).toMatchObject({
      commentCount: 2,
      runCount: 1,
      activityCount: 3,
      label: '2 评论 · 1 次运行 · 3 活动',
    });
  });

  it('empty state', () => {
    expect(buildSheetStorylineSummary({}).label).toMatch(/尚无/);
  });
});

describe('buildSheetFailCta', () => {
  it('hidden when latest run ok', () => {
    expect(
      buildSheetFailCta({
        issueId: 'iss-1',
        latestRunStatus: 'completed',
      }).show,
    ).toBe(false);
  });

  it('shows for failed with run deep link', () => {
    const cta = buildSheetFailCta({
      issueId: 'iss-1',
      latestRunStatus: 'failed',
      failureReason: 'timeout',
      latestRunId: 'run-9',
    });
    expect(cta.show).toBe(true);
    expect(cta.href).toBe('/runs/run-9');
    expect(cta.label).toMatch(/失败|重试/);
    expect(cta.reason).toBe('timeout');
  });
});

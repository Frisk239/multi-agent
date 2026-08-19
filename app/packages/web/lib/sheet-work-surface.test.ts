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

  it('failed → in-place rerun, no run deep link', () => {
    const cta = buildSheetFailCta({
      issueId: 'iss-1',
      latestRunStatus: 'failed',
      failureReason: 'timeout',
      latestRunId: 'run-9',
    });
    expect(cta.show).toBe(true);
    expect(cta.action).toBe('rerun');
    expect(cta.runId).toBe('run-9');
    expect(cta.issueId).toBe('iss-1');
    expect(cta.href).toBe('');
    expect(cta.label).toMatch(/再执行/);
    expect(cta.reason).toBe('timeout');
  });

  it('cancelled → open-run deep link', () => {
    const cta = buildSheetFailCta({
      issueId: 'iss-1',
      latestRunStatus: 'cancelled',
      latestRunId: 'run-9',
    });
    expect(cta.show).toBe(true);
    expect(cta.action).toBe('open-run');
    expect(cta.href).toBe('/runs/run-9');
    expect(cta.label).toMatch(/取消/);
  });
});

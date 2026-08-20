import { describe, expect, it } from 'vitest';
import type { AutomationRun } from '@ma/shared';
import {
  groupAutomationRunsForSkippedDrilldown,
  SKIPPED_STREAK_WINDOW,
  skippedStreakLabel,
  skippedStreakWindowNote,
} from './automation-skipped-streak';

function run(
  id: string,
  status: AutomationRun['status'],
  plannedAt: string,
): AutomationRun {
  return {
    id,
    ruleId: 'rule-1',
    plannedAt,
    source: 'schedule',
    status,
    issueId: null,
    linkedRunId: null,
    error: null,
    createdAt: plannedAt,
    updatedAt: plannedAt,
  };
}

describe('automation skipped streak helpers', () => {
  it('labels the bounded 20-record streak without claiming an unknown total', () => {
    expect(skippedStreakLabel(3)).toBe('连续跳过 3 次');
    expect(skippedStreakLabel(SKIPPED_STREAK_WINDOW)).toBe('连续跳过 ≥20 次');
    expect(skippedStreakWindowNote(19)).toBeNull();
    expect(skippedStreakWindowNote(SKIPPED_STREAK_WINDOW)).toBe('仅基于最近 20 条执行记录');
  });

  it('groups every skipped audit record and summarizes by latest planned time', () => {
    const runs = [
      run('skip-created-later', 'skipped', '2026-08-20T00:00:00.000Z'),
      run('pending', 'pending_dispatch', '2026-08-20T03:00:00.000Z'),
      run('skip-planned-later', 'skipped', '2026-08-20T04:00:00.000Z'),
    ];

    const grouped = groupAutomationRunsForSkippedDrilldown(runs);

    expect(grouped.skippedRuns.map((item) => item.id)).toEqual([
      'skip-created-later',
      'skip-planned-later',
    ]);
    expect(grouped.nonSkippedRuns.map((item) => item.id)).toEqual(['pending']);
    expect(grouped.latestSkippedRun?.id).toBe('skip-planned-later');
  });
});

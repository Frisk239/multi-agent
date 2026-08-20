import type { AutomationRun } from '@ma/shared';

/** The backend derives skippedStreak from this bounded recent-run window. */
export const SKIPPED_STREAK_WINDOW = 20;

export function skippedStreakLabel(streak: number): string {
  return `连续跳过 ${streak >= SKIPPED_STREAK_WINDOW ? `≥${SKIPPED_STREAK_WINDOW}` : streak} 次`;
}

export function skippedStreakWindowNote(streak: number): string | null {
  if (streak < SKIPPED_STREAK_WINDOW) return null;
  return `仅基于最近 ${SKIPPED_STREAK_WINDOW} 条执行记录`;
}

function plannedTimestamp(run: AutomationRun): number {
  const parsed = Date.parse(run.plannedAt);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Keep audit records in their API order, but select the newest planned skip for
 * the collapsed summary. API ordering is currently createdAt-desc, whereas the
 * operator-facing summary explicitly promises the latest planned instant.
 */
export function groupAutomationRunsForSkippedDrilldown(runs: AutomationRun[]): {
  skippedRuns: AutomationRun[];
  nonSkippedRuns: AutomationRun[];
  latestSkippedRun: AutomationRun | null;
} {
  const skippedRuns = runs.filter((run) => run.status === 'skipped');
  const nonSkippedRuns = runs.filter((run) => run.status !== 'skipped');
  const latestSkippedRun = skippedRuns.reduce<AutomationRun | null>((latest, run) => {
    if (!latest || plannedTimestamp(run) > plannedTimestamp(latest)) return run;
    return latest;
  }, null);

  return { skippedRuns, nonSkippedRuns, latestSkippedRun };
}

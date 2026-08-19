/**
 * F2 · Issue sheet "enough to work" projections (pure).
 * Storyline summary + primary fail CTA without leaving the board.
 */

export type SheetStorylineSummary = {
  commentCount: number;
  activityCount: number;
  runCount: number;
  /** One-line zh summary for the sheet header strip. */
  label: string;
};

export function buildSheetStorylineSummary(input: {
  commentCount?: number | null;
  activityCount?: number | null;
  runCount?: number | null;
}): SheetStorylineSummary {
  const commentCount = Math.max(0, input.commentCount ?? 0);
  const activityCount = Math.max(0, input.activityCount ?? 0);
  const runCount = Math.max(0, input.runCount ?? 0);
  const parts: string[] = [];
  if (commentCount > 0) parts.push(`${commentCount} 评论`);
  if (runCount > 0) parts.push(`${runCount} 次运行`);
  if (activityCount > 0) parts.push(`${activityCount} 活动`);
  const label = parts.length > 0 ? parts.join(' · ') : '尚无评论 / 运行';
  return { commentCount, activityCount, runCount, label };
}

export type SheetFailAction = 'rerun' | 'open-run';

export type SheetFailCta = {
  show: boolean;
  label: string;
  action: SheetFailAction | null;
  issueId: string;
  runId: string | null;
  /** Deep link only for cancelled / open-run. Fail path stays on the board. */
  href: string;
  reason: string | null;
};

/**
 * Primary fail CTA for sheet: in-place rerun, or deep-link cancelled runs.
 */
export function buildSheetFailCta(input: {
  issueId: string;
  latestRunStatus?: string | null;
  failureReason?: string | null;
  latestRunId?: string | null;
}): SheetFailCta {
  const hidden: SheetFailCta = {
    show: false,
    label: '',
    action: null,
    issueId: input.issueId,
    runId: input.latestRunId ?? null,
    href: '',
    reason: null,
  };
  if (input.latestRunStatus === 'cancelled') {
    return {
      show: true,
      label: '查看已取消运行',
      action: 'open-run',
      issueId: input.issueId,
      runId: input.latestRunId ?? null,
      href: input.latestRunId
        ? `/runs/${input.latestRunId}`
        : `/issues/${input.issueId}`,
      reason: input.failureReason ?? input.latestRunStatus,
    };
  }
  if (
    input.latestRunStatus !== 'failed' &&
    input.latestRunStatus !== 'timed_out'
  ) {
    return hidden;
  }
  return {
    show: true,
    label: '再执行',
    action: 'rerun',
    issueId: input.issueId,
    runId: input.latestRunId ?? null,
    href: '',
    reason: input.failureReason ?? input.latestRunStatus ?? null,
  };
}

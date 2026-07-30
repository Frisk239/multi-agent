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

export type SheetFailCta = {
  show: boolean;
  /** Primary action label */
  label: string;
  /** Deep link within the product (relative). */
  href: string;
  reason: string | null;
};

/**
 * Primary fail CTA for sheet: retry issue run or open runs failed filter.
 */
export function buildSheetFailCta(input: {
  issueId: string;
  latestRunStatus?: string | null;
  failureReason?: string | null;
  latestRunId?: string | null;
}): SheetFailCta {
  const failed =
    input.latestRunStatus === 'failed' ||
    input.latestRunStatus === 'timed_out' ||
    input.latestRunStatus === 'cancelled';
  if (!failed) {
    return { show: false, label: '', href: '', reason: null };
  }
  const runHref = input.latestRunId
    ? `/runs/${input.latestRunId}`
    : `/issues/${input.issueId}`;
  return {
    show: true,
    label: input.latestRunStatus === 'cancelled' ? '查看已取消运行' : '查看失败并重试',
    href: runHref,
    reason: input.failureReason ?? input.latestRunStatus ?? null,
  };
}

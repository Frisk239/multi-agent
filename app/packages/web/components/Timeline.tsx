'use client';
import type { Comment } from '@ma/shared';
import { TimelineItemView } from './TimelineItem';

/** Issue 详情已有外层「动态」标题时传 hideHeader，避免双标题 */
export function Timeline({
  items,
  hideHeader = false,
}: {
  items: Comment[];
  hideHeader?: boolean;
}) {
  return (
    <section className="timeline" data-testid="issue-timeline">
      {!hideHeader ? (
        <div className="timeline-header">动态 · {items.length} 条</div>
      ) : null}
      {items.length === 0 ? (
        <p className="text-dim text-sm" data-testid="issue-timeline-empty">
          还没有评论
        </p>
      ) : (
        items.map((c) => <TimelineItemView key={c.id} item={c} />)
      )}
    </section>
  );
}

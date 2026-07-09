'use client';
import type { Comment } from '@ma/shared';
import { TimelineItemView } from './TimelineItem';

export function Timeline({ items }: { items: Comment[] }) {
  return (
    <section className="timeline">
      <div className="timeline-header">动态 · {items.length} 条</div>
      {items.map((c) => (
        <TimelineItemView key={c.id} item={c} />
      ))}
    </section>
  );
}

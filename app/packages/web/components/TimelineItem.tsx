'use client';
import type { Comment, IssueStatus } from '@ma/shared';
import { StatusChangeBody } from '@ma/shared';
import { MarkdownBody } from './MarkdownBody';

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function TimelineItemView({ item }: { item: Comment }) {
  if (item.type === 'status_change') {
    let text = item.body;
    try {
      const parsed = StatusChangeBody.safeParse(JSON.parse(item.body));
      if (parsed.success) {
        text = `${item.authorLabel} 将状态从 ${STATUS_ZH[parsed.data.from]} 改为 ${STATUS_ZH[parsed.data.to]}`;
      }
    } catch {
      /* raw */
    }
    return (
      <div className="timeline-item timeline-item--status">
        <div className="timeline-meta">
          <span className="timeline-author">{item.authorLabel}</span>
          <span className="timeline-time">{formatTime(item.createdAt)}</span>
          <span className="timeline-badge">状态变更</span>
        </div>
        <div className="timeline-body timeline-body--status">{text}</div>
      </div>
    );
  }

  return (
    <div className="timeline-item">
      <div className="timeline-meta">
        <span className="timeline-author">{item.authorLabel}</span>
        <span className="timeline-time">{formatTime(item.createdAt)}</span>
      </div>
      <div className="timeline-body">
        <MarkdownBody source={item.body} />
      </div>
    </div>
  );
}

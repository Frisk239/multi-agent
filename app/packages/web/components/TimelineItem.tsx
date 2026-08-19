'use client';
import Link from 'next/link';
import type { Comment, IssueStatus } from '@ma/shared';
import type { ReactNode } from 'react';
import { StatusChangeBody } from '@ma/shared';
import { MarkdownBody } from './MarkdownBody';

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: '待规划',
  todo: '待办',
  in_progress: '进行中',
  in_review: '审核中',
  done: '已完成',
  blocked: '阻塞',
  cancelled: '已取消',
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export type TimelineItemViewProps = {
  item: Comment;
  /** 评论 Tab 的一层回复视觉缩进；Storyline 不传，保持既有显示。 */
  isReply?: boolean;
  /** 该回复为 root 指定的结论。 */
  isResolution?: boolean;
  /** 由 Timeline 提供的 thread action；status_change 不使用。 */
  actions?: ReactNode;
};

export function TimelineItemView({
  item,
  isReply = false,
  isResolution = false,
  actions,
}: TimelineItemViewProps) {
  if (item.type === 'status_change') {
    let text = item.body;
    let toStatus: string | null = null;
    try {
      const parsed = StatusChangeBody.safeParse(JSON.parse(item.body));
      if (parsed.success) {
        toStatus = parsed.data.to;
        text = `${item.authorLabel} 将状态从 ${STATUS_ZH[parsed.data.from]} 改为 ${STATUS_ZH[parsed.data.to]}`;
      }
    } catch {
      /* raw */
    }
    return (
      <div className="timeline-item timeline-item--status" data-testid={`timeline-item-${item.id}`}>
        <div className="timeline-meta">
          <span className="timeline-author">{item.authorLabel}</span>
          <span className="timeline-time">{formatTime(item.createdAt)}</span>
          <span className="timeline-badge">状态变更</span>
          {toStatus && toStatus !== 'cancelled' ? (
            <Link
              href={`/?status=${encodeURIComponent(toStatus)}`}
              className="timeline-status-board-link"
              data-testid="timeline-status-board-link"
              data-status={toStatus}
              title={`看板聚焦：${STATUS_ZH[toStatus as keyof typeof STATUS_ZH] ?? toStatus}`}
            >
              看板
            </Link>
          ) : null}
        </div>
        <div className="timeline-body timeline-body--status">{text}</div>
      </div>
    );
  }

  const hasMention = /mention:\/\/(agent|squad)\//.test(item.body);
  const isDispatchSummary =
    item.authorId === 'system' && item.body.includes('@提及派发');

  return (
    <div
      className={`timeline-item${isDispatchSummary ? ' timeline-item--dispatch' : ''}${
        isReply ? ' timeline-item--reply' : ''
      }${isResolution ? ' timeline-item--resolution' : ''}`}
      data-testid={`timeline-item-${item.id}`}
      data-thread-role={isReply ? 'reply' : undefined}
    >
      <div className="timeline-meta">
        <span className="timeline-author">{item.authorLabel}</span>
        <span className="timeline-time">{formatTime(item.createdAt)}</span>
        {isResolution && <span className="timeline-badge timeline-badge--resolution">结论</span>}
        {isDispatchSummary && (
          <span className="timeline-badge timeline-badge--dispatch">派发</span>
        )}
        {hasMention && !isDispatchSummary && (
          <span className="timeline-badge timeline-badge--mention">@提及</span>
        )}
      </div>
      <div className="timeline-body">
        <MarkdownBody source={item.body} />
      </div>
      {actions ? <div className="timeline-item-actions">{actions}</div> : null}
    </div>
  );
}

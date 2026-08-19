'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Comment } from '@ma/shared';
import {
  groupCommentThreads,
  hasCollapsibleThreadReplies,
  isCommentThreadResolved,
  visibleThreadReplies,
} from '@/lib/comment-threads';
import { TimelineItemView } from './TimelineItem';

export type TimelineProps = {
  items: Comment[];
  /** Issue 详情已有外层「动态」标题时传 hideHeader，避免双标题。 */
  hideHeader?: boolean;
  /** 仅评论 Tab 接入；Storyline 使用 TimelineItemView，不受影响。 */
  onReply?: (root: Comment) => void;
  onResolveThread?: (rootCommentId: string) => void;
  onUnresolveThread?: (rootCommentId: string) => void;
  resolvingRootId?: string | null;
  unresolvingRootId?: string | null;
};

/**
 * Issue 评论 Tab：普通评论按 root + 直接 replies 展示；状态变更仍按原顺序平铺。
 * 这个投影刻意不共享给 IssueStoryline，避免改动其全局时序契约。
 */
export function Timeline({
  items,
  hideHeader = false,
  onReply,
  onResolveThread,
  onUnresolveThread,
  resolvingRootId = null,
  unresolvingRootId = null,
}: TimelineProps) {
  const entries = useMemo(() => groupCommentThreads(items), [items]);
  const [expandedResolvedRootIds, setExpandedResolvedRootIds] = useState<Set<string>>(
    () => new Set(),
  );

  // resolve → unresolve → resolve 时不能继承上一次的展开态；新的定论默认折叠。
  const resolvedThreadFingerprints = useMemo(
    () =>
      new Map(
        entries.flatMap((entry) =>
          entry.kind === 'thread' && isCommentThreadResolved(entry.root)
            ? [
                [
                  entry.root.id,
                  `${entry.root.resolvedAt ?? ''}:${entry.root.resolutionCommentId ?? ''}`,
                ] as const,
              ]
            : [],
        ),
      ),
    [entries],
  );
  const resolvedThreadKey = [...resolvedThreadFingerprints.entries()]
    .map(([rootId, fingerprint]) => `${rootId}:${fingerprint}`)
    .join('|');
  const previousResolvedThreadFingerprints = useRef(new Map<string, string>());
  useEffect(() => {
    const previousFingerprints = previousResolvedThreadFingerprints.current;
    setExpandedResolvedRootIds((previous) => {
      const next = new Set(
        [...previous].filter((id) => {
          const currentFingerprint = resolvedThreadFingerprints.get(id);
          return (
            currentFingerprint !== undefined &&
            previousFingerprints.get(id) === currentFingerprint
          );
        }),
      );
      if (next.size === previous.size && [...next].every((id) => previous.has(id))) {
        return previous;
      }
      return next;
    });
    previousResolvedThreadFingerprints.current = new Map(resolvedThreadFingerprints);
  }, [resolvedThreadFingerprints, resolvedThreadKey]);

  function setResolvedThreadExpanded(rootId: string, expanded: boolean) {
    setExpandedResolvedRootIds((previous) => {
      const next = new Set(previous);
      if (expanded) next.add(rootId);
      else next.delete(rootId);
      return next;
    });
  }

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
        entries.map((entry) => {
          if (entry.kind === 'item') {
            return <TimelineItemView key={entry.item.id} item={entry.item} />;
          }

          const { root, replies } = entry;
          const resolved = isCommentThreadResolved(root);
          const expanded = expandedResolvedRootIds.has(root.id);
          const visibleReplies = visibleThreadReplies(root, replies, expanded);
          const collapsible = hasCollapsibleThreadReplies(root, replies);
          const hiddenReplyCount = Math.max(0, replies.length - visibleReplies.length);
          const repliesRegionId = `timeline-thread-replies-${root.id}`;
          const actionPending =
            resolvingRootId === root.id || unresolvingRootId === root.id;

          return (
            <div
              key={root.id}
              className={`timeline-thread${resolved ? ' timeline-thread--resolved' : ''}`}
              data-testid={`timeline-thread-${root.id}`}
            >
              <TimelineItemView
                item={root}
                actions={
                  onReply || onResolveThread || onUnresolveThread ? (
                    <div className="timeline-thread-actions" aria-label="评论线程操作">
                      {onReply ? (
                        <button
                          type="button"
                          className="timeline-thread-action"
                          onClick={() => onReply(root)}
                          data-testid={`timeline-thread-reply-${root.id}`}
                        >
                          回复
                        </button>
                      ) : null}
                      {resolved ? (
                        onUnresolveThread ? (
                          <button
                            type="button"
                            className="timeline-thread-action"
                            onClick={() => onUnresolveThread(root.id)}
                            disabled={actionPending}
                            data-testid={`timeline-thread-unresolve-${root.id}`}
                          >
                            {actionPending ? '处理中…' : '撤销定论'}
                          </button>
                        ) : null
                      ) : replies.length > 0 && onResolveThread ? (
                        <button
                          type="button"
                          className="timeline-thread-action"
                          onClick={() => onResolveThread(root.id)}
                          disabled={actionPending}
                          data-testid={`timeline-thread-resolve-${root.id}`}
                        >
                          {actionPending ? '处理中…' : '设最后回复为结论'}
                        </button>
                      ) : null}
                    </div>
                  ) : null
                }
              />

              {replies.length > 0 ? (
                <div
                  id={repliesRegionId}
                  className="timeline-thread-replies"
                  role="group"
                  aria-label={`${root.authorLabel} 的回复`}
                >
                  {visibleReplies.map((reply) => (
                    <TimelineItemView
                      key={reply.id}
                      item={reply}
                      isReply
                      isResolution={root.resolutionCommentId === reply.id}
                    />
                  ))}
                </div>
              ) : null}

              {collapsible ? (
                <button
                  type="button"
                  className="timeline-thread-toggle"
                  onClick={() => setResolvedThreadExpanded(root.id, !expanded)}
                  aria-expanded={expanded}
                  aria-controls={repliesRegionId}
                  data-testid={`timeline-thread-toggle-${root.id}`}
                >
                  {expanded
                    ? '收起其余回复'
                    : `展开其余 ${hiddenReplyCount} 条回复`}
                </button>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}

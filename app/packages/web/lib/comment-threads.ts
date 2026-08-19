import type { Comment } from '@ma/shared';

/** 评论 Tab 的轻量投影；不参与 IssueStoryline 的全局时序。 */
export type CommentThreadTimelineEntry =
  | {
      kind: 'thread';
      root: Comment;
      replies: Comment[];
    }
  | {
      kind: 'item';
      item: Comment;
    };

function isRootComment(item: Comment): boolean {
  return item.type === 'comment' && !item.parentCommentId;
}

/**
 * 仅在评论 Tab 把普通评论投影成「根评论 + 一层回复」。
 *
 * 输入的既有顺序不变：根评论和非线程项仍按 Timeline 原有顺序平铺；
 * 合法的直接回复只在根评论下渲染。异常/过深 parent 保持平铺，绝不静默丢失。
 */
export function groupCommentThreads(
  items: readonly Comment[] | null | undefined,
): CommentThreadTimelineEntry[] {
  const list = items ?? [];
  const byId = new Map(list.map((item) => [item.id, item]));
  const repliesByRootId = new Map<string, Comment[]>();

  for (const item of list) {
    if (item.type !== 'comment' || !item.parentCommentId) continue;
    const parent = byId.get(item.parentCommentId);
    if (!parent || !isRootComment(parent)) continue;
    const replies = repliesByRootId.get(parent.id) ?? [];
    replies.push(item);
    repliesByRootId.set(parent.id, replies);
  }

  return list.flatMap((item): CommentThreadTimelineEntry[] => {
    if (isRootComment(item)) {
      return [
        {
          kind: 'thread',
          root: item,
          replies: repliesByRootId.get(item.id) ?? [],
        },
      ];
    }

    // 已被直接根评论接住的 reply 不再重复平铺；其他项目始终保留。
    if (
      item.type === 'comment' &&
      item.parentCommentId &&
      repliesByRootId.get(item.parentCommentId)?.some((reply) => reply.id === item.id)
    ) {
      return [];
    }

    return [{ kind: 'item', item }];
  });
}

/** 根评论带 resolvedAt 即为已定论；缺失 resolution id 时仍允许撤销。 */
export function isCommentThreadResolved(root: Comment): boolean {
  return Boolean(root.resolvedAt);
}

/**
 * 已定论且 resolution reply 仍在列表内时，默认只保留该条回复；
 * 旧数据/并发刷新造成的缺失引用宁可完整展示，也不隐藏讨论内容。
 */
export function visibleThreadReplies(
  root: Comment,
  replies: readonly Comment[],
  expanded: boolean,
): Comment[] {
  const resolutionId = root.resolutionCommentId ?? null;
  if (!isCommentThreadResolved(root) || !resolutionId || expanded) {
    return [...replies];
  }
  const resolution = replies.find((reply) => reply.id === resolutionId);
  return resolution ? [resolution] : [...replies];
}

/** 只有真的折叠了其它 reply 时才展示展开/收起控件。 */
export function hasCollapsibleThreadReplies(
  root: Comment,
  replies: readonly Comment[],
): boolean {
  const visible = visibleThreadReplies(root, replies, false);
  return isCommentThreadResolved(root) && visible.length < replies.length;
}

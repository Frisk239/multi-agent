/**
 * S3 · 评论 thread-lite + fold 投影（纯函数，可单测）
 *
 * 两个动机，第二个才是重点：
 *  1. 人：长讨论要能定论收起，回头只看「问题 + 结论」。
 *  2. agent：注入 prompt 的评论历史里，已定论线程只需带根与结论，
 *     中间来回不必再喂一遍 —— 这是实打实省 token。
 *
 * 刻意的边界（AC3）：只支持 root + 一层回复。任意深树会让折叠语义、
 * 通知语义和 prompt 投影同时变复杂，本阶段明确 Out。
 */

export type ThreadComment = {
  id: string;
  parentCommentId?: string | null;
  resolvedAt?: number | string | null;
  resolutionCommentId?: string | null;
  createdAt: number | string;
  body: string;
  type?: string;
};

export type FoldedThread<T extends ThreadComment> = {
  root: T;
  /** 被标为结论的那条回复；未定论时为 null */
  resolution: T | null;
  /** 折叠视图下隐藏了多少条回复 */
  foldedCount: number;
  isResolved: boolean;
  /** 折叠视图应显示的评论（根 + 结论） */
  visible: T[];
  /** 展开后的完整回复（按时间升序），保证不丢历史 */
  allReplies: T[];
};

function asMillis(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

/** 只有根评论（parentCommentId 为空）能成为线程头。 */
export function isRootComment(c: ThreadComment): boolean {
  return c.parentCommentId == null || c.parentCommentId === '';
}

export function isThreadResolved(root: ThreadComment): boolean {
  return root.resolvedAt != null && asMillis(root.resolvedAt) > 0;
}

/**
 * 把平铺评论列表折成「线程」列表。
 * 顺序按根评论 createdAt 升序；孤儿回复（父不存在）提升为根，避免历史被吞掉。
 */
export function foldCommentThreads<T extends ThreadComment>(
  comments: readonly T[],
): Array<FoldedThread<T>> {
  const byId = new Map<string, T>();
  for (const c of comments) byId.set(c.id, c);

  const roots: T[] = [];
  const repliesByRoot = new Map<string, T[]>();

  for (const c of comments) {
    if (isRootComment(c)) {
      roots.push(c);
      continue;
    }
    const parentId = c.parentCommentId!;
    const parent = byId.get(parentId);
    // 父不存在 → 提升为根，宁可多显示也不要静默丢历史
    if (!parent) {
      roots.push(c);
      continue;
    }
    const arr = repliesByRoot.get(parentId) ?? [];
    arr.push(c);
    repliesByRoot.set(parentId, arr);
  }

  roots.sort((a, b) => asMillis(a.createdAt) - asMillis(b.createdAt));

  return roots.map((root) => {
    const allReplies = (repliesByRoot.get(root.id) ?? [])
      .slice()
      .sort((a, b) => asMillis(a.createdAt) - asMillis(b.createdAt));

    const resolved = isThreadResolved(root);
    const resolution =
      resolved && root.resolutionCommentId
        ? allReplies.find((r) => r.id === root.resolutionCommentId) ?? null
        : null;

    if (!resolved) {
      return {
        root,
        resolution: null,
        foldedCount: 0,
        isResolved: false,
        visible: [root, ...allReplies],
        allReplies,
      };
    }

    const visible = resolution ? [root, resolution] : [root];
    const foldedCount = allReplies.length - (resolution ? 1 : 0);
    return {
      root,
      resolution,
      foldedCount: Math.max(0, foldedCount),
      isResolved: true,
      visible,
      allReplies,
    };
  });
}

/** 折叠条文案：必须说清藏了多少条，否则用户不知道历史还在。 */
export function foldSummaryLabel(foldedCount: number): string | null {
  if (foldedCount <= 0) return null;
  return `已折叠 ${foldedCount} 条讨论`;
}

export type ResolveValidation =
  | { ok: true; resolutionCommentId: string | null }
  | { ok: false; code: 'not_root' | 'not_a_reply' | 'no_replies'; message: string };

/**
 * 校验一次 resolve 请求。
 * - 目标必须是根评论
 * - 指定的结论必须是该根的直接回复
 * - 未指定时取最后一条回复；无回复则拒绝（没有可当结论的东西）
 */
export function validateResolve<T extends ThreadComment>(
  root: T | null | undefined,
  replies: readonly T[],
  requestedResolutionId?: string | null,
): ResolveValidation {
  if (!root || !isRootComment(root)) {
    return { ok: false, code: 'not_root', message: '只能对根评论定论' };
  }

  const ordered = replies
    .slice()
    .sort((a, b) => asMillis(a.createdAt) - asMillis(b.createdAt));

  if (requestedResolutionId) {
    const hit = ordered.find((r) => r.id === requestedResolutionId);
    if (!hit) {
      return {
        ok: false,
        code: 'not_a_reply',
        message: '指定的结论不是该线程的回复',
      };
    }
    return { ok: true, resolutionCommentId: hit.id };
  }

  const last = ordered[ordered.length - 1];
  if (!last) {
    return { ok: false, code: 'no_replies', message: '该线程还没有回复，无法定论' };
  }
  return { ok: true, resolutionCommentId: last.id };
}

/**
 * agent prompt 用的紧凑投影：已定论线程只保留根与结论。
 * 这是 fold 的真正收益点（少喂 token），与 UI 折叠共用同一套判定。
 */
export function projectThreadsForPrompt<T extends ThreadComment>(
  comments: readonly T[],
): T[] {
  const out: T[] = [];
  for (const t of foldCommentThreads(comments)) {
    out.push(...t.visible);
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import {
  foldCommentThreads,
  foldSummaryLabel,
  isRootComment,
  isThreadResolved,
  projectThreadsForPrompt,
  validateResolve,
  type ThreadComment,
} from './comment-thread.js';

const c = (
  id: string,
  createdAt: number,
  extra: Partial<ThreadComment> = {},
): ThreadComment => ({ id, createdAt, body: `body-${id}`, ...extra });

describe('isRootComment / isThreadResolved', () => {
  it('parentCommentId 空值都算根', () => {
    expect(isRootComment(c('a', 1))).toBe(true);
    expect(isRootComment(c('a', 1, { parentCommentId: null }))).toBe(true);
    expect(isRootComment(c('a', 1, { parentCommentId: '' }))).toBe(true);
    expect(isRootComment(c('a', 1, { parentCommentId: 'root' }))).toBe(false);
  });

  it('resolvedAt 有值才算已定论', () => {
    expect(isThreadResolved(c('a', 1))).toBe(false);
    expect(isThreadResolved(c('a', 1, { resolvedAt: null }))).toBe(false);
    expect(isThreadResolved(c('a', 1, { resolvedAt: 0 }))).toBe(false);
    expect(isThreadResolved(c('a', 1, { resolvedAt: 123 }))).toBe(true);
    expect(isThreadResolved(c('a', 1, { resolvedAt: '2026-07-31T00:00:00.000Z' }))).toBe(true);
  });
});

describe('foldCommentThreads', () => {
  it('未定论线程全展开，不折叠任何东西', () => {
    const list = [
      c('r1', 100),
      c('a1', 110, { parentCommentId: 'r1' }),
      c('a2', 120, { parentCommentId: 'r1' }),
    ];
    const threads = foldCommentThreads(list);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.isResolved).toBe(false);
    expect(threads[0]!.foldedCount).toBe(0);
    expect(threads[0]!.visible.map((x) => x.id)).toEqual(['r1', 'a1', 'a2']);
  });

  it('已定论线程只显示根 + 结论，并报出折叠条数', () => {
    const list = [
      c('r1', 100, { resolvedAt: 500, resolutionCommentId: 'a3' }),
      c('a1', 110, { parentCommentId: 'r1' }),
      c('a2', 120, { parentCommentId: 'r1' }),
      c('a3', 130, { parentCommentId: 'r1' }),
    ];
    const t = foldCommentThreads(list)[0]!;
    expect(t.isResolved).toBe(true);
    expect(t.resolution?.id).toBe('a3');
    expect(t.visible.map((x) => x.id)).toEqual(['r1', 'a3']);
    // 3 条回复里结论占 1 条，折叠 2 条
    expect(t.foldedCount).toBe(2);
  });

  // 「展开不丢历史」
  it('allReplies 始终保留完整历史（升序）', () => {
    const list = [
      c('r1', 100, { resolvedAt: 500, resolutionCommentId: 'a3' }),
      c('a3', 130, { parentCommentId: 'r1' }),
      c('a1', 110, { parentCommentId: 'r1' }),
      c('a2', 120, { parentCommentId: 'r1' }),
    ];
    const t = foldCommentThreads(list)[0]!;
    expect(t.allReplies.map((x) => x.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('多线程按根评论时间升序', () => {
    const list = [c('r2', 200), c('r1', 100), c('x', 150, { parentCommentId: 'r1' })];
    const threads = foldCommentThreads(list);
    expect(threads.map((t) => t.root.id)).toEqual(['r1', 'r2']);
  });

  it('已定论但结论 id 指向不存在的回复 → 只显示根，且不谎报折叠数', () => {
    const list = [
      c('r1', 100, { resolvedAt: 500, resolutionCommentId: 'ghost' }),
      c('a1', 110, { parentCommentId: 'r1' }),
    ];
    const t = foldCommentThreads(list)[0]!;
    expect(t.resolution).toBeNull();
    expect(t.visible.map((x) => x.id)).toEqual(['r1']);
    expect(t.foldedCount).toBe(1);
    expect(t.allReplies.map((x) => x.id)).toEqual(['a1']);
  });

  // 防静默丢历史：父被删/不在本次查询范围
  it('孤儿回复提升为根，不被吞掉', () => {
    const list = [c('orphan', 100, { parentCommentId: 'missing-root' })];
    const threads = foldCommentThreads(list);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.root.id).toBe('orphan');
  });

  it('空输入返回空数组', () => {
    expect(foldCommentThreads([])).toEqual([]);
  });

  it('无回复的已定论线程不出现负数折叠', () => {
    const t = foldCommentThreads([c('r1', 100, { resolvedAt: 500 })])[0]!;
    expect(t.foldedCount).toBe(0);
  });
});

describe('foldSummaryLabel', () => {
  it('有折叠才出文案，并说明条数', () => {
    expect(foldSummaryLabel(2)).toBe('已折叠 2 条讨论');
    expect(foldSummaryLabel(0)).toBeNull();
    expect(foldSummaryLabel(-1)).toBeNull();
  });
});

describe('validateResolve', () => {
  const replies = [
    c('a1', 110, { parentCommentId: 'r1' }),
    c('a2', 120, { parentCommentId: 'r1' }),
  ];

  it('不指定结论时取最后一条回复', () => {
    const r = validateResolve(c('r1', 100), replies);
    expect(r).toEqual({ ok: true, resolutionCommentId: 'a2' });
  });

  it('可显式指定某条回复为结论', () => {
    const r = validateResolve(c('r1', 100), replies, 'a1');
    expect(r).toEqual({ ok: true, resolutionCommentId: 'a1' });
  });

  it('拒绝对非根评论定论（不允许二层结论）', () => {
    const r = validateResolve(c('a1', 110, { parentCommentId: 'r1' }), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_root');
  });

  it('拒绝把不属于该线程的评论当结论', () => {
    const r = validateResolve(c('r1', 100), replies, 'somewhere-else');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_a_reply');
  });

  it('没有回复时无法定论', () => {
    const r = validateResolve(c('r1', 100), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no_replies');
  });

  it('root 缺失时拒绝', () => {
    expect(validateResolve(null, replies).ok).toBe(false);
    expect(validateResolve(undefined, replies).ok).toBe(false);
  });
});

describe('projectThreadsForPrompt', () => {
  it('已定论线程只喂根与结论，省 agent token', () => {
    const list = [
      c('r1', 100, { resolvedAt: 500, resolutionCommentId: 'a3' }),
      c('a1', 110, { parentCommentId: 'r1' }),
      c('a2', 120, { parentCommentId: 'r1' }),
      c('a3', 130, { parentCommentId: 'r1' }),
      c('r2', 200),
      c('b1', 210, { parentCommentId: 'r2' }),
    ];
    expect(projectThreadsForPrompt(list).map((x) => x.id)).toEqual([
      'r1',
      'a3',
      'r2',
      'b1',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ISSUE_LIMIT_MAX,
  ISSUE_PAGE_SIZE,
  limitForPages,
  summarizeIssuePaging,
} from './issue-list-paging';

describe('limitForPages', () => {
  it('第一页就要够一屏，不是 0', () => {
    expect(limitForPages(1)).toBe(ISSUE_PAGE_SIZE);
  });

  it('按页数线性放大窗口', () => {
    expect(limitForPages(2)).toBe(ISSUE_PAGE_SIZE * 2);
    expect(limitForPages(3)).toBe(ISSUE_PAGE_SIZE * 3);
  });

  it('夹在后端 limit 上限内，不构造会被 400 拒绝的请求', () => {
    expect(limitForPages(999)).toBe(ISSUE_LIMIT_MAX);
  });

  it('页数非法时退化成一页而不是空窗口', () => {
    expect(limitForPages(0)).toBe(ISSUE_PAGE_SIZE);
    expect(limitForPages(-5)).toBe(ISSUE_PAGE_SIZE);
    expect(limitForPages(Number.NaN)).toBe(ISSUE_PAGE_SIZE);
  });
});

describe('summarizeIssuePaging', () => {
  // 这条正是本刀要修的真实缺陷：dev.db 122 条，默认只取 50
  it('50/122 时必须承认还有 72 条没加载', () => {
    const s = summarizeIssuePaging(50, 122);
    expect(s.hasMore).toBe(true);
    expect(s.remaining).toBe(72);
    expect(s.atLimitCeiling).toBe(false);
    expect(s.label).toContain('50 / 122');
    expect(s.label).toContain('72');
  });

  it('全部加载后不再提示加载更多', () => {
    const s = summarizeIssuePaging(122, 122);
    expect(s.hasMore).toBe(false);
    expect(s.remaining).toBe(0);
    expect(s.label).toBe('共 122 条，已全部显示');
  });

  it('撞到 limit 上限时说实话，而不是给一个点了没用的按钮', () => {
    const s = summarizeIssuePaging(ISSUE_LIMIT_MAX, 900);
    expect(s.atLimitCeiling).toBe(true);
    expect(s.hasMore).toBe(false);
    expect(s.remaining).toBe(400);
    expect(s.label).toContain('上限');
  });

  it('total 缺失时按「就这些」处理，不做假承诺', () => {
    expect(summarizeIssuePaging(30, undefined).hasMore).toBe(false);
    expect(summarizeIssuePaging(30, null).hasMore).toBe(false);
    expect(summarizeIssuePaging(30, Number.NaN).hasMore).toBe(false);
  });

  it('total 小于已加载数时 remaining 不为负', () => {
    const s = summarizeIssuePaging(60, 50);
    expect(s.remaining).toBe(0);
    expect(s.hasMore).toBe(false);
  });

  it('空列表不崩、不提示加载更多', () => {
    const s = summarizeIssuePaging(0, 0);
    expect(s.hasMore).toBe(false);
    expect(s.label).toBe('共 0 条，已全部显示');
  });
});

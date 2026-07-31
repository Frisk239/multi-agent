import { describe, expect, it } from 'vitest';
import { buildSnippet, projectSearchHits, type SearchCandidate } from './issue-search.js';

const cand = (over: Partial<SearchCandidate> & { issueId: string }): SearchCandidate => ({
  identifier: `FRI-${over.issueId}`,
  title: 'title',
  description: null,
  comments: [],
  ...over,
});

describe('buildSnippet', () => {
  it('命中词居中并加省略号', () => {
    const long = 'x'.repeat(200) + 'NEEDLE' + 'y'.repeat(200);
    const s = buildSnippet(long, 'needle', 10)!;
    expect(s).toContain('NEEDLE');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });

  it('短文本不加省略号', () => {
    expect(buildSnippet('hello world', 'world', 60)).toBe('hello world');
  });

  it('压缩空白', () => {
    expect(buildSnippet('a\n\n  b\tc', 'b')).toBe('a b c');
  });

  it('空文本返回 null', () => {
    expect(buildSnippet('', 'x')).toBeNull();
    expect(buildSnippet('   ', 'x')).toBeNull();
  });

  it('未命中时退回开头片段', () => {
    expect(buildSnippet('abcdef', 'zzz', 3)).toBe('abcdef');
  });
});

describe('projectSearchHits', () => {
  it('空查询返回空', () => {
    expect(projectSearchHits([cand({ issueId: '1' })], '')).toEqual([]);
    expect(projectSearchHits([cand({ issueId: '1' })], '   ')).toEqual([]);
  });

  it('identifier 命中，snippet 用标题', () => {
    const hits = projectSearchHits([cand({ issueId: '1', identifier: 'FRI-42', title: '登录修复' })], 'fri-42');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.matchSource).toBe('identifier');
    expect(hits[0]!.snippet).toBe('登录修复');
    expect(hits[0]!.commentId).toBeNull();
  });

  it('title 与 description 命中', () => {
    const t = projectSearchHits([cand({ issueId: '1', title: '缓存穿透' })], '穿透');
    expect(t[0]!.matchSource).toBe('title');

    const d = projectSearchHits(
      [cand({ issueId: '1', title: 'x', description: '需要加布隆过滤器' })],
      '布隆',
    );
    expect(d[0]!.matchSource).toBe('description');
  });

  // 这是本刀的核心缺口：评论正文可搜
  it('评论正文命中，返回 commentId 与评论片段', () => {
    const hits = projectSearchHits(
      [
        cand({
          issueId: '1',
          title: '无关标题',
          comments: [
            { id: 'c1', body: '先不动这块', createdAt: 100 },
            { id: 'c2', body: '结论：改用连接池', createdAt: 200 },
          ],
        }),
      ],
      '连接池',
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.matchSource).toBe('comment');
    expect(hits[0]!.commentId).toBe('c2');
    expect(hits[0]!.snippet).toContain('连接池');
  });

  // 按 Issue 去重：一个 issue 有多条命中评论也只出一条
  it('同一 Issue 多条命中评论只出一条，取最早那条', () => {
    const hits = projectSearchHits(
      [
        cand({
          issueId: '1',
          comments: [
            { id: 'c3', body: '连接池 again', createdAt: 300 },
            { id: 'c1', body: '连接池 first', createdAt: 100 },
            { id: 'c2', body: '连接池 second', createdAt: 200 },
          ],
        }),
      ],
      '连接池',
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.commentId).toBe('c1');
  });

  it('标题与评论同时命中时算标题（取最强来源）', () => {
    const hits = projectSearchHits(
      [
        cand({
          issueId: '1',
          title: '连接池优化',
          comments: [{ id: 'c1', body: '连接池细节', createdAt: 100 }],
        }),
      ],
      '连接池',
    );
    expect(hits[0]!.matchSource).toBe('title');
    expect(hits[0]!.commentId).toBeNull();
  });

  it('按来源强弱排序：identifier > title > description > comment', () => {
    const hits = projectSearchHits(
      [
        cand({ issueId: 'd', title: 'x', description: 'kw here' }),
        cand({ issueId: 'c', title: 'x', comments: [{ id: 'c1', body: 'kw', createdAt: 1 }] }),
        cand({ issueId: 'a', identifier: 'kw-1', title: 'x' }),
        cand({ issueId: 'b', title: 'kw title' }),
      ],
      'kw',
    );
    expect(hits.map((h) => h.matchSource)).toEqual([
      'identifier',
      'title',
      'description',
      'comment',
    ]);
  });

  it('同来源按 identifier 稳定排序（同查询两次同序）', () => {
    const list = [
      cand({ issueId: '2', identifier: 'FRI-20', title: 'kw b' }),
      cand({ issueId: '1', identifier: 'FRI-10', title: 'kw a' }),
    ];
    const first = projectSearchHits(list, 'kw').map((h) => h.identifier);
    const second = projectSearchHits(list, 'kw').map((h) => h.identifier);
    expect(first).toEqual(['FRI-10', 'FRI-20']);
    expect(second).toEqual(first);
  });

  it('大小写不敏感', () => {
    expect(projectSearchHits([cand({ issueId: '1', title: 'CacheMiss' })], 'cachemiss')).toHaveLength(1);
  });

  it('无命中返回空', () => {
    expect(projectSearchHits([cand({ issueId: '1', title: 'abc' })], 'zzz')).toEqual([]);
  });

  it('limit 生效，防止一次拉爆', () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      cand({ issueId: String(i), identifier: `FRI-${String(i).padStart(3, '0')}`, title: 'kw' }),
    );
    expect(projectSearchHits(many, 'kw', { limit: 10 })).toHaveLength(10);
  });
});

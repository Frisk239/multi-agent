/**
 * S6 · Issue 搜索投影（纯函数，可单测）
 *
 * 缺口：原 GET /api/issues 的 q 只 LIKE identifier/title/description，
 * 「上周谁在评论里说了什么」根本搜不到 —— 而讨论恰恰主要发生在评论里。
 * 上游 Multica 在 handler/issue.go:625 的 SearchIssues 会连评论正文一起搜，
 * 并回传 match_source 与命中评论内容，本模块对齐这个形状。
 *
 * 刻意的边界：不做向量/语义检索，不建通用搜索 DSL。就是一个有上限的
 * identifier/title/description/comment-body 匹配 + 按 Issue 去重。
 */

/** 命中来源。identifier 最强，comment 最弱，用于排序与 UI 标注。 */
export type MatchSource = 'identifier' | 'title' | 'description' | 'comment';

const SOURCE_RANK: Record<MatchSource, number> = {
  identifier: 0,
  title: 1,
  description: 2,
  comment: 3,
};

export type SearchCandidate = {
  issueId: string;
  identifier: string;
  title: string;
  description?: string | null;
  /** 命中的评论（可能多条，取最匹配的一条） */
  comments?: ReadonlyArray<{ id: string; body: string; createdAt: number }>;
};

export type SearchHit = {
  issueId: string;
  identifier: string;
  title: string;
  matchSource: MatchSource;
  /** 命中片段（评论命中时来自评论正文，否则来自标题/描述） */
  snippet: string | null;
  /** 仅当 matchSource==='comment' 时非空，便于前端直接跳到该评论 */
  commentId: string | null;
};

/** 截取命中词周围的上下文，命中词居中，两侧加省略号。 */
export function buildSnippet(
  text: string,
  needle: string,
  radius = 60,
): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const q = (needle ?? '').trim().toLowerCase();
  if (!q) return t.slice(0, radius * 2);

  const idx = t.toLowerCase().indexOf(q);
  if (idx < 0) return t.slice(0, radius * 2);

  const start = Math.max(0, idx - radius);
  const end = Math.min(t.length, idx + q.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < t.length ? '…' : '';
  return `${prefix}${t.slice(start, end)}${suffix}`;
}

function includesCI(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

/**
 * 把候选集折成「每个 Issue 一条」的命中列表。
 *
 * 去重规则：同一 Issue 只出一条，取**最强**命中来源
 * （identifier > title > description > comment）。这样搜到一个 issue
 * 不会因为它有 10 条命中评论就刷屏。
 */
export function projectSearchHits(
  candidates: readonly SearchCandidate[],
  query: string,
  opts: { limit?: number; snippetRadius?: number } = {},
): SearchHit[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [];
  const radius = opts.snippetRadius ?? 60;

  const hits: SearchHit[] = [];

  for (const c of candidates) {
    let source: MatchSource | null = null;
    let snippet: string | null = null;
    let commentId: string | null = null;

    if (includesCI(c.identifier, q)) {
      source = 'identifier';
      snippet = c.title;
    } else if (includesCI(c.title, q)) {
      source = 'title';
      snippet = buildSnippet(c.title, q, radius);
    } else if (includesCI(c.description, q)) {
      source = 'description';
      snippet = buildSnippet(c.description ?? '', q, radius);
    } else {
      // 评论命中：取时间最早的那条命中评论，保证结果稳定可复现
      const matched = (c.comments ?? [])
        .filter((m) => includesCI(m.body, q))
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      const first = matched[0];
      if (first) {
        source = 'comment';
        snippet = buildSnippet(first.body, q, radius);
        commentId = first.id;
      }
    }

    if (!source) continue;
    hits.push({
      issueId: c.issueId,
      identifier: c.identifier,
      title: c.title,
      matchSource: source,
      snippet,
      commentId,
    });
  }

  // 强来源优先，同来源按 identifier 稳定排序（避免同一查询两次结果不同序）
  hits.sort(
    (a, b) =>
      SOURCE_RANK[a.matchSource] - SOURCE_RANK[b.matchSource] ||
      a.identifier.localeCompare(b.identifier),
  );

  const limit = opts.limit ?? 50;
  return hits.slice(0, limit);
}

/**
 * S1 · Issue 列表连续性（纯函数，可单测）
 *
 * 背景：KanbanBoard 过去调用 useIssues() 不传 limit/offset，后端 ListIssuesQuery
 * 默认 limit=50，而前端只取 `page.data`、丢掉 `total`，也没有任何「加载更多」入口。
 * 结果是 122 条 issue 只显示 50 条，其余 72 条无任何提示地不可见——这是 UI 层的
 * 静默数据丢失，不是缺一个分页装饰。
 *
 * 取舍：看板按 status 分列，offset 翻页会让每列变成任意子集（语义错误）。所以这里用
 * 「递增窗口」：始终 offset=0，只把 limit 放大到 pageSize 的整数倍。任一时刻加载的都是
 * 完整有序集合的前缀，列的归属恒定正确，代价是重取一次更大的窗口——在本地单机
 * 规模（上限 500）完全可接受。
 */

/** 每次「加载更多」增加的条数。 */
export const ISSUE_PAGE_SIZE = 50;

/** 后端 ListIssuesQuery 允许的 limit 上限（shared/schema.ts: max(500)）。 */
export const ISSUE_LIMIT_MAX = 500;

/** 把「已加载页数」换算成请求 limit，并夹在后端允许范围内。 */
export function limitForPages(
  pages: number,
  pageSize: number = ISSUE_PAGE_SIZE,
  max: number = ISSUE_LIMIT_MAX,
): number {
  const safePages = Number.isFinite(pages) ? Math.floor(pages) : 1;
  const safeSize = Math.max(1, Math.floor(pageSize));
  const wanted = Math.max(1, safePages) * safeSize;
  return Math.min(Math.max(safeSize, wanted), max);
}

export type IssuePagingSummary = {
  /** 当前已加载条数（服务端实际返回的条数）。 */
  loaded: number;
  /** 服务端报告的匹配总数。 */
  total: number;
  /** 还有多少条没加载。 */
  remaining: number;
  /** 是否还能继续加载（且未撞到 limit 上限）。 */
  hasMore: boolean;
  /** 是否已经撞到后端 limit 上限，无法再靠放大窗口取更多。 */
  atLimitCeiling: boolean;
  /** 给用户看的一句话，必须诚实说出「还有多少条没显示」。 */
  label: string;
};

/**
 * 由 (已加载条数, 总数) 推出分页摘要。
 * total 缺失/非法时按「就这些」处理，宁可不显示「加载更多」也不要假承诺。
 */
export function summarizeIssuePaging(
  loaded: number,
  total: number | null | undefined,
  max: number = ISSUE_LIMIT_MAX,
): IssuePagingSummary {
  const safeLoaded = Math.max(0, Math.floor(loaded ?? 0));
  const safeTotal =
    typeof total === 'number' && Number.isFinite(total) && total >= 0
      ? Math.floor(total)
      : safeLoaded;
  const remaining = Math.max(0, safeTotal - safeLoaded);
  const atLimitCeiling = remaining > 0 && safeLoaded >= max;
  const hasMore = remaining > 0 && !atLimitCeiling;

  let label: string;
  if (remaining <= 0) {
    label = `共 ${safeTotal} 条，已全部显示`;
  } else if (atLimitCeiling) {
    label = `已显示 ${safeLoaded} / ${safeTotal} 条，已达单次加载上限 ${max}，请用筛选缩小范围`;
  } else {
    label = `已显示 ${safeLoaded} / ${safeTotal} 条，还有 ${remaining} 条未加载`;
  }

  return { loaded: safeLoaded, total: safeTotal, remaining, hasMore, atLimitCeiling, label };
}

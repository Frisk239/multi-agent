/**
 * S1 · 列表位置恢复（纯函数 + 可注入存储，可单测）
 *
 * 现状拆解：
 *  - 筛选 / 排序 / 视图模式已经在 URL 里（KanbanBoard 全用 router.replace + scroll:false），
 *    返回时天然恢复，不需要这里管。
 *  - 侧滑详情用 `?issue=`，看板不卸载，滚动条也不会丢。
 *  - 真正会丢的是走**全页** `/issues/[id]` 再返回：KanbanBoard 被卸载，
 *    `pagesLoaded` 归 1、虚拟列表滚回顶部，用户之前翻到第 80 条的位置全没了。
 *
 * 取舍：按「锚点行 id」恢复而不是记像素偏移。行高随密度档（compact/default/comfortable）
 * 变化，像素偏移换档就错位；记住当时顶部那一行是哪个 issue，回来后滚到它，
 * 密度变了也仍然对得上。
 */

export type IssueListViewState = {
  /** 已加载的页数（递增窗口），恢复后才能继续看到第 50 条之后的内容 */
  pagesLoaded: number;
  /** 当时列表顶部可见行的 issue id；找不到时回退到 index */
  anchorIssueId: string | null;
  /** 锚点当时的行序号，作为 anchorIssueId 失效（被删/被筛掉）时的兜底 */
  anchorIndex: number;
};

/** 只依赖 get/set/remove，便于用内存 Map 单测，不碰真实 sessionStorage。 */
export type SimpleStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const KEY_PREFIX = 'ma-issue-list-view:';

/**
 * SSR / 隐私模式安全的 sessionStorage 访问器。
 * 用 sessionStorage 而非 localStorage：列表位置是「本次浏览」的上下文，
 * 不该跨会话复活到一个早已变样的列表上。
 */
export function sessionStorageOrNull(): SimpleStorage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * 视图键：同一组筛选/排序/视图才共享一份位置。
 * 换了筛选条件就该是新视图，不该把旧位置套上去。
 */
export function makeListViewKey(parts: Record<string, string | null | undefined>): string {
  const normalized = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${(parts[k] ?? '').toString()}`)
    .join('&');
  return KEY_PREFIX + normalized;
}

export function saveListViewState(
  storage: SimpleStorage | null | undefined,
  key: string,
  state: IssueListViewState,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // 存储写满 / 隐私模式：位置恢复是锦上添花，不该让它把页面搞崩
  }
}

/** 读取并校验；任何不可信内容都当「没有保存过」处理。 */
export function readListViewState(
  storage: SimpleStorage | null | undefined,
  key: string,
): IssueListViewState | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as Record<string, unknown>;

    const pagesLoaded =
      typeof o.pagesLoaded === 'number' && Number.isFinite(o.pagesLoaded)
        ? Math.max(1, Math.floor(o.pagesLoaded))
        : 1;
    const anchorIndex =
      typeof o.anchorIndex === 'number' && Number.isFinite(o.anchorIndex)
        ? Math.max(0, Math.floor(o.anchorIndex))
        : 0;
    const anchorIssueId = typeof o.anchorIssueId === 'string' ? o.anchorIssueId : null;

    return { pagesLoaded, anchorIssueId, anchorIndex };
  } catch {
    return null;
  }
}

export function clearListViewState(
  storage: SimpleStorage | null | undefined,
  key: string,
): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // 同上，静默
  }
}

/**
 * 把保存的锚点解析成当前列表里的行号。
 * 优先按 issue id 命中（顺序变了也能跟上）；id 已不在列表时退回 anchorIndex 并夹到边界内。
 * 返回 null 表示不需要滚动（空列表或锚点就在顶部）。
 */
export function resolveRestoreIndex(
  issueIds: readonly string[],
  state: IssueListViewState | null | undefined,
): number | null {
  if (!state || issueIds.length === 0) return null;

  if (state.anchorIssueId) {
    const hit = issueIds.indexOf(state.anchorIssueId);
    if (hit >= 0) return hit === 0 ? null : hit;
  }

  const clamped = Math.min(state.anchorIndex, issueIds.length - 1);
  return clamped <= 0 ? null : clamped;
}

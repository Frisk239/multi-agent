/**
 * S6 · 最近访问（纯函数 + 可注入存储，可单测）
 *
 * 原状：CommandPalette 在空查询时把「本地已加载的 issues 前 8 条」当成「最近」
 * （见其注释）。那不是最近访问，只是碰巧在内存里的前几条 —— 用户点开过什么
 * 完全没有记录。
 *
 * 这里记真实打开记录：按 key 去重、最新的在前、有上限、可一键清空。
 * 用 localStorage（跨会话保留），与列表滚动位置用 sessionStorage 的取舍不同：
 * 「我上周开过哪些 issue」跨会话仍然有用。
 */

export const RECENT_LIMIT = 8;
const STORAGE_KEY = 'ma-recent-visits';

export type RecentVisit = {
  /** 去重键，通常是路由路径，如 /issues/<id> */
  key: string;
  label: string;
  /** 可选的分组标注，如 'Issue' / '智能体' */
  kind?: string;
  visitedAt: number;
};

export type SimpleStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function localStorageOrNull(): SimpleStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读取并校验；任何不可信内容都当「没有记录」。 */
export function readRecentVisits(storage: SimpleStorage | null | undefined): RecentVisit[] {
  if (!storage) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: RecentVisit[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const o = item as Record<string, unknown>;
      if (typeof o.key !== 'string' || !o.key) continue;
      if (typeof o.label !== 'string') continue;
      const visitedAt =
        typeof o.visitedAt === 'number' && Number.isFinite(o.visitedAt) ? o.visitedAt : 0;
      out.push({
        key: o.key,
        label: o.label,
        kind: typeof o.kind === 'string' ? o.kind : undefined,
        visitedAt,
      });
    }
    // 最新在前
    return out.sort((a, b) => b.visitedAt - a.visitedAt).slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

/**
 * 纯函数：把一次访问并入既有列表。
 * 同 key 去重（保留最新一次并更新 label），最新在前，截断到上限。
 */
export function mergeVisit(
  existing: readonly RecentVisit[],
  visit: RecentVisit,
  limit = RECENT_LIMIT,
): RecentVisit[] {
  if (!visit.key) return [...existing].slice(0, limit);
  const rest = existing.filter((v) => v.key !== visit.key);
  return [visit, ...rest]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, limit);
}

/** 记录一次访问。存储不可用时静默跳过 —— 这只是便利功能。 */
export function recordVisit(
  storage: SimpleStorage | null | undefined,
  visit: RecentVisit,
  limit = RECENT_LIMIT,
): RecentVisit[] {
  const merged = mergeVisit(readRecentVisits(storage), visit, limit);
  if (!storage) return merged;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // 写满 / 隐私模式：不影响主流程
  }
  return merged;
}

/** 一键清空。 */
export function clearRecentVisits(storage: SimpleStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 静默
  }
}

import type { Density } from './density';

/** Default overscan for list virtualization (rows above/below viewport). */
export const ISSUE_LIST_OVERSCAN = 12;

/** Fixed list viewport height so virtualizer has a scroll parent. */
export const ISSUE_LIST_VIEWPORT_MAX_HEIGHT = 'min(70vh, 720px)';

/** Estimated row height by UI density (matches table cell padding). */
export function estimateIssueListRowHeight(density: Density = 'default'): number {
  switch (density) {
    case 'compact':
      return 36;
    case 'comfortable':
      return 52;
    case 'default':
    default:
      return 44;
  }
}

export type VirtualRangeItem = {
  index: number;
  start: number;
  size: number;
  end: number;
};

/**
 * Compute top/bottom spacer heights for a table-body virtual window.
 * Prefer passing `totalSize` from `rowVirtualizer.getTotalSize()` when available.
 */
export function computeVirtualTableSpacers(
  totalCount: number,
  virtualItems: readonly VirtualRangeItem[],
  estimateSize: number,
  totalSize?: number,
): { paddingTop: number; paddingBottom: number } {
  if (totalCount <= 0 || virtualItems.length === 0) {
    return { paddingTop: 0, paddingBottom: 0 };
  }
  const first = virtualItems[0]!;
  const last = virtualItems[virtualItems.length - 1]!;
  const paddingTop = Math.max(0, first.start);
  const resolvedTotal =
    typeof totalSize === 'number' && totalSize > 0
      ? totalSize
      : estimateSize * totalCount;
  const paddingBottom = Math.max(0, resolvedTotal - last.end);
  return { paddingTop, paddingBottom };
}

/**
 * True when virtualization meaningfully shrinks DOM vs full render.
 * Threshold matches Slice 29 acceptance (≥200 issues → overscan-scale DOM).
 */
export function shouldVirtualizeIssueList(count: number, threshold = 40): boolean {
  return count >= threshold;
}

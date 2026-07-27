import type { Density } from './density';

/**
 * Default overscan for kanban column virtualization (cards above/below viewport).
 * Slightly smaller than list rows because cards are taller.
 */
export const KANBAN_COLUMN_OVERSCAN = 8;

/**
 * Align with list virtual threshold (`shouldVirtualizeIssueList`):
 * virtualize once a single column has ≥40 issues.
 */
export const KANBAN_COLUMN_VIRTUAL_THRESHOLD = 40;

/**
 * Inter-card gap matching CSS `--card-gap` by density.
 * Applied via virtualizer `gap` so absolute-positioned slots stay spaced.
 */
export function estimateKanbanCardGap(density: Density = 'default'): number {
  switch (density) {
    case 'compact':
      return 4;
    case 'comfortable':
      return 12;
    case 'default':
    default:
      return 8;
  }
}

/**
 * Estimated card height (without inter-card gap) by UI density.
 * Used only as a first paint estimate; measureElement refines live sizes.
 */
export function estimateKanbanCardHeight(density: Density = 'default'): number {
  switch (density) {
    case 'compact':
      return 104;
    case 'comfortable':
      return 136;
    case 'default':
    default:
      return 120;
  }
}

/**
 * True when column virtualization meaningfully shrinks DOM vs full render.
 * Threshold matches Slice 29 / list helper default (≥40).
 */
export function shouldVirtualizeKanbanColumn(
  count: number,
  threshold: number = KANBAN_COLUMN_VIRTUAL_THRESHOLD,
): boolean {
  return count >= threshold;
}

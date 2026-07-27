import { describe, expect, it } from 'vitest';
import {
  KANBAN_COLUMN_OVERSCAN,
  KANBAN_COLUMN_VIRTUAL_THRESHOLD,
  estimateKanbanCardGap,
  estimateKanbanCardHeight,
  shouldVirtualizeKanbanColumn,
} from './kanban-column-virtual';
import { shouldVirtualizeIssueList } from './issue-list-virtual';

describe('kanban-column-virtual helpers', () => {
  it('estimates denser cards for compact density', () => {
    expect(estimateKanbanCardHeight('compact')).toBeLessThan(
      estimateKanbanCardHeight('default'),
    );
    expect(estimateKanbanCardHeight('default')).toBeLessThan(
      estimateKanbanCardHeight('comfortable'),
    );
  });

  it('matches CSS card-gap scale by density', () => {
    expect(estimateKanbanCardGap('compact')).toBe(4);
    expect(estimateKanbanCardGap('default')).toBe(8);
    expect(estimateKanbanCardGap('comfortable')).toBe(12);
  });

  it('uses a modest overscan for tall cards', () => {
    expect(KANBAN_COLUMN_OVERSCAN).toBeGreaterThanOrEqual(4);
    expect(KANBAN_COLUMN_OVERSCAN).toBeLessThanOrEqual(16);
  });

  it('virtualizes once count crosses the list-aligned threshold', () => {
    expect(KANBAN_COLUMN_VIRTUAL_THRESHOLD).toBe(40);
    expect(shouldVirtualizeKanbanColumn(39)).toBe(false);
    expect(shouldVirtualizeKanbanColumn(40)).toBe(true);
    expect(shouldVirtualizeKanbanColumn(200)).toBe(true);
  });

  it('matches list virtual threshold strategy', () => {
    expect(shouldVirtualizeKanbanColumn(39)).toBe(shouldVirtualizeIssueList(39));
    expect(shouldVirtualizeKanbanColumn(40)).toBe(shouldVirtualizeIssueList(40));
  });

  it('allows overriding threshold', () => {
    expect(shouldVirtualizeKanbanColumn(10, 10)).toBe(true);
    expect(shouldVirtualizeKanbanColumn(9, 10)).toBe(false);
  });
});

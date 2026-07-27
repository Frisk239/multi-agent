import { describe, expect, it } from 'vitest';
import {
  ISSUE_LIST_OVERSCAN,
  computeVirtualTableSpacers,
  estimateIssueListRowHeight,
  shouldVirtualizeIssueList,
} from './issue-list-virtual';

describe('issue-list-virtual helpers', () => {
  it('estimates denser rows for compact density', () => {
    expect(estimateIssueListRowHeight('compact')).toBeLessThan(
      estimateIssueListRowHeight('default'),
    );
    expect(estimateIssueListRowHeight('default')).toBeLessThan(
      estimateIssueListRowHeight('comfortable'),
    );
  });

  it('uses overscan on the order of ~10 rows', () => {
    expect(ISSUE_LIST_OVERSCAN).toBeGreaterThanOrEqual(8);
    expect(ISSUE_LIST_OVERSCAN).toBeLessThanOrEqual(24);
  });

  it('computes top/bottom spacers so only the window is padded', () => {
    const estimate = 44;
    const total = 200;
    // Simulate mid-list window: indices 40..55
    const virtualItems = Array.from({ length: 16 }, (_, i) => {
      const index = 40 + i;
      const start = index * estimate;
      return { index, start, size: estimate, end: start + estimate };
    });
    const { paddingTop, paddingBottom } = computeVirtualTableSpacers(
      total,
      virtualItems,
      estimate,
    );
    expect(paddingTop).toBe(40 * estimate);
    expect(paddingBottom).toBe((total - 56) * estimate);
    // DOM rows would be virtualItems + 2 spacer rows << 200
    const renderedDataRows = virtualItems.length;
    expect(renderedDataRows + ISSUE_LIST_OVERSCAN).toBeLessThan(total / 2);
  });

  it('returns zero spacers for empty lists', () => {
    expect(computeVirtualTableSpacers(0, [], 44)).toEqual({
      paddingTop: 0,
      paddingBottom: 0,
    });
  });

  it('virtualizes once count crosses threshold', () => {
    expect(shouldVirtualizeIssueList(39)).toBe(false);
    expect(shouldVirtualizeIssueList(40)).toBe(true);
    expect(shouldVirtualizeIssueList(200)).toBe(true);
  });
});

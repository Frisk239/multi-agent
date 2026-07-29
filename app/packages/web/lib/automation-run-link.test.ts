import { describe, expect, it } from 'vitest';
import { automationRunHref } from './automation-run-link';

describe('automationRunHref', () => {
  it('links into Runs mission control and encodes the selected run id', () => {
    expect(automationRunHref('run/id + 1')).toBe(
      '/runs?run=run%2Fid%20%2B%201',
    );
  });
});

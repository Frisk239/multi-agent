import { describe, expect, it } from 'vitest';
import { classifyAutomationRunNowOutcome } from './automation-run-now-outcome';

describe('classifyAutomationRunNowOutcome', () => {
  it.each([
    ['dispatching', 'warning'],
    ['issue_created', 'success'],
    ['pending_dispatch', 'error'],
    ['running', 'success'],
    ['retrying', 'warning'],
    ['success', 'error'],
    ['failed', 'error'],
    ['skipped', 'warning'],
    [undefined, 'error'],
    [null, 'error'],
    ['', 'error'],
    ['future_status', 'error'],
  ] as const)('classifies %p as %s', (status, expected) => {
    expect(classifyAutomationRunNowOutcome(status)).toBe(expected);
  });
});

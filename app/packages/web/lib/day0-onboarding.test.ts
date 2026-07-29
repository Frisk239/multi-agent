import { beforeEach, describe, expect, it } from 'vitest';
import {
  DAY0_SESSION_KEY,
  DAY0_STORAGE_KEY,
  migrateDay0Storage,
  readDay0Completed,
  writeDay0Completed,
} from './day0-onboarding';

describe('day0 onboarding storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists one versioned completion record with destination', () => {
    const saved = writeDay0Completed(localStorage, { issueId: 'i-1', runId: 'r-1' });
    expect(saved.version).toBe(2);
    expect(readDay0Completed(localStorage)).toMatchObject({
      completed: true,
      issueId: 'i-1',
      runId: 'r-1',
    });
    expect(localStorage.getItem(DAY0_STORAGE_KEY)).toContain('"version":2');
  });

  it('cleans incompatible legacy keys without mixing session dismissal and completion', () => {
    localStorage.setItem('ma.onboarding.v1', 'done');
    localStorage.setItem('ma-onboarding-dismissed', '1');
    sessionStorage.setItem('ma.onboarding.dismissed', '1');
    sessionStorage.setItem(DAY0_SESSION_KEY, '1');

    migrateDay0Storage(localStorage, sessionStorage);

    expect(localStorage.getItem('ma.onboarding.v1')).toBeNull();
    expect(localStorage.getItem('ma-onboarding-dismissed')).toBeNull();
    expect(sessionStorage.getItem('ma.onboarding.dismissed')).toBeNull();
    expect(sessionStorage.getItem(DAY0_SESSION_KEY)).toBe('1');
  });
});

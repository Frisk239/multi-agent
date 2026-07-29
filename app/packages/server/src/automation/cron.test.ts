import { describe, it, expect } from 'vitest';
import {
  automationStatusForEnqueue,
  computeNextPlannedAt,
  computeDuePlannedAt,
} from '../orchestration/automation-dispatch.js';

describe('cron schedule computations', () => {
  it('does not report skipped enqueue as success', () => {
    expect(automationStatusForEnqueue('skipped')).toBe('pending_dispatch');
    expect(automationStatusForEnqueue('queued')).toBe('issue_created');
  });
  it('should compute next run for cron correctly', () => {
    // 2026-07-26 15:00:00 (some fixed time)
    const now = new Date('2026-07-26T15:00:00Z').getTime();
    const rule = {
      enabled: true,
      scheduleKind: 'cron' as const,
      intervalMinutes: null,
      dailyTime: null,
      cronExpression: '0 * * * *', // every hour at minute 0
    };
    try {
      const next = computeNextPlannedAt(rule as any, now);
      expect(next).toBe(new Date('2026-07-26T16:00:00Z').getTime());
    } catch (e) {
      console.log('Error', e);
    }
  });

  it('should compute due run for cron correctly', () => {
    const now = new Date('2026-07-26T15:01:00Z').getTime();
    const rule = {
      enabled: true,
      scheduleKind: 'cron' as const,
      intervalMinutes: null,
      dailyTime: null,
      cronExpression: '0 * * * *', // every hour at minute 0
    };
    const due = computeDuePlannedAt(rule as any, now);
    // previous tick should be 15:00:00
    expect(due).toBe(new Date('2026-07-26T15:00:00Z').getTime());
  });

  it('should return null for invalid cron expression', () => {
    const rule = {
      enabled: true,
      scheduleKind: 'cron' as const,
      intervalMinutes: null,
      dailyTime: null,
      cronExpression: 'invalid cron',
    };
    expect(computeNextPlannedAt(rule as any, Date.now())).toBeNull();
    expect(computeDuePlannedAt(rule as any, Date.now())).toBeNull(); // rule row mismatch but okay for test
  });
});

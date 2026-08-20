import { describe, it, expect } from 'vitest';
import { dueState, dueModifierClass, localDateKey } from './due';

/**
 * issue-due-date：三态判定纯函数
 * - null/空 → null；昨天 overdue；今天/明天 soon；更远 normal
 * - 本地时区当天 23:59:59 边界：今天全天不 overdue
 */

const NOW = new Date(2026, 7, 20, 10, 30, 0); // 2026-08-20 10:30 本地

describe('dueState', () => {
  it('无日期（null/undefined/空串）返回 null', () => {
    expect(dueState(null, NOW)).toBeNull();
    expect(dueState(undefined, NOW)).toBeNull();
    expect(dueState('', NOW)).toBeNull();
  });

  it('截止日早于今天 → overdue', () => {
    expect(dueState('2026-08-19', NOW)).toBe('overdue');
    expect(dueState('2026-07-01', NOW)).toBe('overdue');
  });

  it('今天/明天 → soon（当天 23:59:59 前不算过期）', () => {
    const lateTonight = new Date(2026, 7, 20, 23, 59, 0);
    expect(dueState('2026-08-20', NOW)).toBe('soon');
    expect(dueState('2026-08-20', lateTonight)).toBe('soon');
    expect(dueState('2026-08-21', NOW)).toBe('soon');
  });

  it('更远日期 → normal', () => {
    expect(dueState('2026-08-22', NOW)).toBe('normal');
    expect(dueState('2027-01-01', NOW)).toBe('normal');
  });

  it('月底/跨月边界正确', () => {
    const aug31 = new Date(2026, 7, 31, 9, 0, 0);
    expect(dueState('2026-08-30', aug31)).toBe('overdue');
    expect(dueState('2026-09-01', aug31)).toBe('soon');
    const sep1 = new Date(2026, 8, 1, 9, 0, 0);
    expect(dueState('2026-08-31', sep1)).toBe('overdue');
  });

  it('非法格式兜底为 normal（边界已被 Zod 挡住）', () => {
    expect(dueState('2026-8-20', NOW)).toBe('normal');
    expect(dueState('not-a-date', NOW)).toBe('normal');
  });
});

describe('dueModifierClass', () => {
  it('三态映射到 issue-card-due--*；normal/null 无修饰', () => {
    expect(dueModifierClass('overdue')).toBe('issue-card-due--overdue');
    expect(dueModifierClass('soon')).toBe('issue-card-due--soon');
    expect(dueModifierClass('normal')).toBe('');
    expect(dueModifierClass(null)).toBe('');
  });
});

describe('localDateKey', () => {
  it('本地日期补零为 YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

/**
 * issue-due-date：截止日期三态判定（纯前端，本地时区）。
 *
 * 语义（学 multica board-card showDueDate 的 date-only 用法）：
 * - dueDate 是 `YYYY-MM-DD` date-only 字符串，服务端只存取不解释；
 * - 「当天 23:59:59 边界」：截止日等于今天时，全天内不算过期（今天结束才 overdue）；
 * - overdue = 截止日早于今天；soon = 今天或明天；normal = 更远；null = 未设置。
 *
 * 用本地日期 key（YYYY-MM-DD）做字典序比较，避免时区换算歧义。
 */

export type DueState = 'overdue' | 'soon' | 'normal';

/** Date → 本地时区 YYYY-MM-DD（与 dueDate 同构，可字典序比较） */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 截止日期 → 三态；无日期/空串 → null（不渲染 chip）。
 * 格式非法时按 normal 处理（Zod 已在边界挡掉非法格式，这里只做兜底）。
 */
export function dueState(
  dueDate: string | null | undefined,
  now: Date = new Date(),
): DueState | null {
  if (!dueDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 'normal';
  const today = localDateKey(now);
  const tomorrow = localDateKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  );
  if (dueDate < today) return 'overdue';
  if (dueDate === today || dueDate === tomorrow) return 'soon';
  return 'normal';
}

/** 三态 → 修饰 class（overdue/soon 有高亮；normal 无修饰） */
export function dueModifierClass(state: DueState | null): string {
  if (state === 'overdue') return 'issue-card-due--overdue';
  if (state === 'soon') return 'issue-card-due--soon';
  return '';
}

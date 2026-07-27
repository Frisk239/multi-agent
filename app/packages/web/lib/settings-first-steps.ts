import type { SettingsCheck } from '@ma/shared';

/**
 * Settings「先做这 3 步」：error 优先，再 warn，最多 max 条。
 * 全 ok 时返回空数组，由 UI 显示正向短文案。
 */
export function pickSettingsFirstSteps(
  checks: SettingsCheck[],
  max = 3,
): SettingsCheck[] {
  const errors = checks.filter((c) => c.status === 'error');
  const warns = checks.filter((c) => c.status === 'warn');
  return [...errors, ...warns].slice(0, Math.max(0, max));
}

/** 红/黄项跳转目标分区（不改双栏结构） */
export function settingsCheckTab(
  checkId: string,
): 'profile' | 'workspace' | 'health' {
  if (checkId === 'cwd') return 'workspace';
  return 'health';
}

export function settingsCheckAnchorId(checkId: string): string {
  return `settings-check-${checkId}`;
}

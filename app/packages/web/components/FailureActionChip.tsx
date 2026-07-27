'use client';

import type { FailureActionUi } from '@/lib/failure-action-map';

/**
 * Slice 64 · 失败可行动 chip：中文 label + 建议动作
 * 复用 run-detail-chip 风格；variant 用 data-variant 区分色差
 */
export function FailureActionChip({
  ui,
  testId,
  className = '',
}: {
  ui: FailureActionUi;
  testId: string;
  className?: string;
}) {
  return (
    <span
      className={['run-detail-chip', 'run-failure-chip', className]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
      data-variant={ui.variant}
      data-reason={ui.reason}
      title={`${ui.label} · ${ui.action}`}
    >
      <span className="run-failure-chip-label">{ui.label}</span>
      <span className="run-failure-chip-sep" aria-hidden>
        ·
      </span>
      <span className="run-failure-chip-action">{ui.action}</span>
    </span>
  );
}

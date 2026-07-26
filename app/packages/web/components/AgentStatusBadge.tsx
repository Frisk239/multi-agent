'use client';

import type { AgentPulseStatus } from '@ma/shared';

interface AgentStatusBadgeProps {
  status?: AgentPulseStatus | null;
  activeRunCount?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const STATUS_CONFIG: Record<
  AgentPulseStatus,
  { label: string; dotClass: string; chipClass: string; color: string }
> = {
  working: {
    label: '工作中',
    dotClass: 'agent-pulse-dot agent-pulse-working',
    chipClass: 'agent-pulse-chip agent-chip-working',
    color: '#10b981', // emerald pulse
  },
  blocked: {
    label: '等待中',
    dotClass: 'agent-pulse-dot agent-pulse-blocked',
    chipClass: 'agent-pulse-chip agent-chip-blocked',
    color: '#f59e0b', // amber pulse
  },
  failed: {
    label: '最近失败',
    dotClass: 'agent-pulse-dot agent-pulse-failed',
    chipClass: 'agent-pulse-chip agent-chip-failed',
    color: '#ef4444', // red pulse
  },
  idle: {
    label: '空闲',
    dotClass: 'agent-pulse-dot agent-pulse-idle',
    chipClass: 'agent-pulse-chip agent-chip-idle',
    color: '#6b7280', // gray dot
  },
  offline: {
    label: '离线',
    dotClass: 'agent-pulse-dot agent-pulse-offline',
    chipClass: 'agent-pulse-chip agent-chip-offline',
    color: '#374151',
  },
};

/**
 * Multica 风格 Agent 动态脉冲状态徽章
 * 支持：working(绿/蓝呼吸灯), blocked(橙), failed(红), idle(灰)
 */
export function AgentStatusBadge({
  status = 'idle',
  activeRunCount = 0,
  showLabel = true,
  size = 'md',
  className = '',
}: AgentStatusBadgeProps) {
  const currentStatus = status || 'idle';
  const cfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.idle;

  const countText = activeRunCount > 1 ? ` (${activeRunCount})` : '';

  return (
    <span
      className={`agent-status-badge size-${size} ${cfg.chipClass} ${className}`}
      title={`智能体状态: ${cfg.label}${countText}`}
      data-testid="agent-status-badge"
      data-status={currentStatus}
    >
      <span className={cfg.dotClass} aria-hidden />
      {showLabel ? (
        <span className="agent-status-label">
          {cfg.label}
          {countText}
        </span>
      ) : null}
    </span>
  );
}

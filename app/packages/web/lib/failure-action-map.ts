/**
 * Slice 64 · 失败 chip 中文动作映射（web UI 真源，不进 shared）
 *
 * 解析顺序：
 * 1. 优先 input.failureReason（已知 map 键）
 * 2. 缺省 → classifyFailure(error, { status }) from @ma/shared
 * 3. 未知 reason → exec_error（label「执行失败」）
 */
import { classifyFailure } from '@ma/shared';

export type FailureActionVariant = 'retry' | 'human' | 'neutral';

export type FailureActionUi = {
  reason: string;
  label: string;
  action: string;
  variant: FailureActionVariant;
};

type MapEntry = Omit<FailureActionUi, 'reason'>;

/** reason → 中文标签 + 建议动作 + 色变体 */
export const FAILURE_ACTION_MAP: Record<string, MapEntry> = {
  auth_required: {
    label: '需登录',
    action: '检查 CLI/账号登录后重试',
    variant: 'human',
  },
  quota_exceeded: {
    label: '额度/限流',
    action: '检查额度或稍后再试',
    variant: 'human',
  },
  session_poisoned: {
    label: '会话损坏',
    action: '强制新会话后重试',
    variant: 'retry',
  },
  idle_timeout: {
    label: '空闲超时',
    action: '调大 idle 超时或再执行',
    variant: 'retry',
  },
  idle_watchdog: {
    label: '空闲看门狗',
    action: '检查进度或再执行',
    variant: 'retry',
  },
  tool_watchdog: {
    label: '工具无响应',
    action: '检查卡死工具或再执行',
    variant: 'retry',
  },
  stale_heartbeat: {
    label: '心跳丢失',
    action: '确认服务/进程后重试',
    variant: 'retry',
  },
  timeout: {
    label: '执行超时',
    action: '查看超时设置后重试',
    variant: 'retry',
  },
  waiting_local_directory_timeout: {
    label: '等待目录超时',
    action: '释放本地目录锁后重试',
    variant: 'retry',
  },
  cancelled: {
    label: '已取消',
    action: '需要时可再执行',
    variant: 'neutral',
  },
  user_aborted: {
    label: '用户中止',
    action: '需要时可再执行',
    variant: 'neutral',
  },
  squad_member_escalated: {
    label: '小队升级',
    action: '查看队长/成员 run',
    variant: 'human',
  },
  exec_error: {
    label: '执行失败',
    action: '查看错误详情后重试',
    variant: 'retry',
  },
};

const FALLBACK_REASON = 'exec_error';

function lookup(reason: string): FailureActionUi {
  const entry = FAILURE_ACTION_MAP[reason] ?? FAILURE_ACTION_MAP[FALLBACK_REASON];
  const finalReason = FAILURE_ACTION_MAP[reason] ? reason : FALLBACK_REASON;
  return {
    reason: finalReason,
    label: entry.label,
    action: entry.action,
    variant: entry.variant,
  };
}

/**
 * 将 run 的 failureReason / error / status 解析为 UI chip 文案。
 */
export function resolveFailureActionUi(input: {
  failureReason?: string | null;
  error?: string | null;
  status?: string | null;
}): FailureActionUi {
  const explicit = input.failureReason?.trim() || '';
  if (explicit) {
    // 已知 map 键直接用；未知 reason 降级 exec_error（不二次猜）
    return lookup(explicit);
  }

  const classified = classifyFailure(input.error, {
    status: input.status ?? undefined,
  });
  return lookup(classified);
}

/** 是否应在 Run 详情 / 列表展示 failure chip */
export function shouldShowFailureActionChip(input: {
  status?: string | null;
  error?: string | null;
  failureReason?: string | null;
}): boolean {
  const status = input.status ?? '';
  if (
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'timed_out'
  ) {
    return true;
  }
  if (input.error?.trim()) return true;
  if (input.failureReason?.trim()) return true;
  return false;
}

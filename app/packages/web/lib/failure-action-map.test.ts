import { describe, it, expect } from 'vitest';
import {
  FAILURE_ACTION_MAP,
  resolveFailureActionUi,
  shouldShowFailureActionChip,
} from './failure-action-map';

const EXPECTED: Array<{
  reason: string;
  label: string;
  action: string;
  variant: 'retry' | 'human' | 'neutral';
}> = [
  {
    reason: 'auth_required',
    label: '需登录',
    action: '检查 CLI/账号登录后重试',
    variant: 'human',
  },
  {
    reason: 'quota_exceeded',
    label: '额度/限流',
    action: '检查额度或稍后再试',
    variant: 'human',
  },
  {
    reason: 'provider_network',
    label: '网络/服务中断',
    action: '网络抖动可自动重试；稍后再试',
    variant: 'retry',
  },
  {
    reason: 'runtime_offline',
    label: '运行时离线',
    action: '确认 CLI/环境就绪后重试',
    variant: 'human',
  },
  {
    reason: 'deferred_escalated',
    label: '延迟升级',
    action: '查看升级/改派后的 run',
    variant: 'neutral',
  },
  {
    reason: 'session_poisoned',
    label: '会话损坏',
    action: '强制新会话后重试',
    variant: 'retry',
  },
  {
    reason: 'idle_timeout',
    label: '空闲超时',
    action: '调大 idle 超时或再执行',
    variant: 'retry',
  },
  {
    reason: 'idle_watchdog',
    label: '空闲看门狗',
    action: '检查进度或再执行',
    variant: 'retry',
  },
  {
    reason: 'tool_watchdog',
    label: '工具无响应',
    action: '检查卡死工具或再执行',
    variant: 'retry',
  },
  {
    reason: 'stale_heartbeat',
    label: '心跳丢失',
    action: '确认服务/进程后重试',
    variant: 'retry',
  },
  {
    reason: 'timeout',
    label: '执行超时',
    action: '查看超时设置后重试',
    variant: 'retry',
  },
  {
    reason: 'waiting_local_directory_timeout',
    label: '等待目录超时',
    action: '释放本地目录锁后重试',
    variant: 'retry',
  },
  {
    reason: 'cancelled',
    label: '已取消',
    action: '需要时可再执行',
    variant: 'neutral',
  },
  {
    reason: 'user_aborted',
    label: '用户中止',
    action: '需要时可再执行',
    variant: 'neutral',
  },
  {
    reason: 'squad_member_escalated',
    label: '小队升级',
    action: '查看队长/成员 run',
    variant: 'human',
  },
  {
    reason: 'exec_error',
    label: '执行失败',
    action: '查看错误详情后重试',
    variant: 'retry',
  },
];

describe('FAILURE_ACTION_MAP', () => {
  it('covers all expected reasons with label/action/variant', () => {
    for (const row of EXPECTED) {
      const entry = FAILURE_ACTION_MAP[row.reason];
      expect(entry, row.reason).toBeDefined();
      expect(entry.label).toBe(row.label);
      expect(entry.action).toBe(row.action);
      expect(entry.variant).toBe(row.variant);
    }
  });
});

describe('resolveFailureActionUi', () => {
  it('maps each known failureReason', () => {
    for (const row of EXPECTED) {
      const ui = resolveFailureActionUi({ failureReason: row.reason });
      expect(ui).toEqual({
        reason: row.reason,
        label: row.label,
        action: row.action,
        variant: row.variant,
      });
    }
  });

  it('prefers failureReason over error text', () => {
    const ui = resolveFailureActionUi({
      failureReason: 'auth_required',
      error: 'tool watchdog fired',
      status: 'failed',
    });
    expect(ui.reason).toBe('auth_required');
    expect(ui.label).toBe('需登录');
    expect(ui.variant).toBe('human');
  });

  it('infers from error when failureReason missing', () => {
    expect(
      resolveFailureActionUi({
        error: 'tool watchdog fired on tool X',
        status: 'failed',
      }).reason,
    ).toBe('tool_watchdog');

    expect(
      resolveFailureActionUi({
        error: 'unauthorized: login required',
      }).reason,
    ).toBe('auth_required');

    expect(
      resolveFailureActionUi({
        error: 'rate limit 429 quota exceeded',
      }).reason,
    ).toBe('quota_exceeded');

    expect(
      resolveFailureActionUi({
        error: 'session poisoned after resume',
      }).reason,
    ).toBe('session_poisoned');
    expect(
      resolveFailureActionUi({
        error: 'idle timeout (no events)',
      }).reason,
    ).toBe('idle_timeout');

    expect(
      resolveFailureActionUi({
        error: 'stale: orphan heartbeat',
      }).reason,
    ).toBe('stale_heartbeat');
  });

  it('G1-4 infers Chinese auth/quota/network errors to the right chip', () => {
    expect(resolveFailureActionUi({ error: '未登录：请先登录 CLI' }).reason).toBe(
      'auth_required',
    );
    expect(resolveFailureActionUi({ error: '额度不足' }).reason).toBe('quota_exceeded');
    expect(resolveFailureActionUi({ error: '连接被重置' }).reason).toBe(
      'provider_network',
    );
    expect(
      resolveFailureActionUi({ error: '网络错误：请求失败' }).label,
    ).toBe('网络/服务中断');
    expect(resolveFailureActionUi({ error: '执行超时' }).reason).toBe('timeout');
  });

  it('uses status=cancelled when no error string', () => {
    const ui = resolveFailureActionUi({
      failureReason: null,
      error: null,
      status: 'cancelled',
    });
    expect(ui.reason).toBe('cancelled');
    expect(ui.label).toBe('已取消');
    expect(ui.variant).toBe('neutral');
  });

  it('degrades unknown failureReason to exec_error', () => {
    const ui = resolveFailureActionUi({
      failureReason: 'totally_unknown_reason',
      error: 'auth required', // must not re-infer when explicit unknown is set
    });
    expect(ui.reason).toBe('exec_error');
    expect(ui.label).toBe('执行失败');
    expect(ui.action).toBe('查看错误详情后重试');
    expect(ui.variant).toBe('retry');
  });

  it('degrades empty / generic error to exec_error', () => {
    expect(resolveFailureActionUi({}).reason).toBe('exec_error');
    expect(resolveFailureActionUi({ error: '' }).reason).toBe('exec_error');
    expect(
      resolveFailureActionUi({ error: 'something went wrong in step 3' }).label,
    ).toBe('执行失败');
  });

  it('trims whitespace failureReason', () => {
    expect(
      resolveFailureActionUi({ failureReason: '  timeout  ' }).reason,
    ).toBe('timeout');
  });
});

describe('shouldShowFailureActionChip', () => {
  it('shows for failed / cancelled / timed_out', () => {
    expect(shouldShowFailureActionChip({ status: 'failed' })).toBe(true);
    expect(shouldShowFailureActionChip({ status: 'cancelled' })).toBe(true);
    expect(shouldShowFailureActionChip({ status: 'timed_out' })).toBe(true);
  });

  it('shows when error or failureReason present', () => {
    expect(
      shouldShowFailureActionChip({
        status: 'running',
        error: 'boom',
      }),
    ).toBe(true);
    expect(
      shouldShowFailureActionChip({
        status: 'completed',
        failureReason: 'exec_error',
      }),
    ).toBe(true);
  });

  it('hides for clean running / completed', () => {
    expect(shouldShowFailureActionChip({ status: 'running' })).toBe(false);
    expect(shouldShowFailureActionChip({ status: 'completed' })).toBe(false);
    expect(shouldShowFailureActionChip({ status: 'queued' })).toBe(false);
  });
});

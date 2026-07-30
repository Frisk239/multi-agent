/**
 * Slice 63 · failureReason Classify 规则表真源
 *
 * 字符串/模式 → AgentRunFailureReason；优先 hints.explicitReason；
 * 匹配顺序从具体到泛化；默认 exec_error。
 * UI 侧 title/hint 仍走 classifyRunFailure（本文件不替代）。
 */
import type { AgentRunFailureReason } from './schema.js';

/**
 * Failure reasons that are safe to retry without operator intervention.
 * Keep this deliberately narrow: auth, quota, cancellation, tool/idle
 * watchdogs and unknown execution errors must remain human-actionable.
 */
export const AUTO_RETRY_FAILURE_REASONS = [
  'timeout',
  'stale_heartbeat',
  'runtime_offline',
  'provider_network',
] as const satisfies readonly AgentRunFailureReason[];
export type AutoRetryFailureReason = (typeof AUTO_RETRY_FAILURE_REASONS)[number];

export function isAutoRetryableFailureReason(
  reason: AgentRunFailureReason | string | null | undefined,
): reason is AutoRetryFailureReason {
  return reason != null && (AUTO_RETRY_FAILURE_REASONS as readonly string[]).includes(reason);
}

/** Generic runs get one retry by default; provider disconnects get one final
 * attempt because a mid-stream network cut is especially transient. */
export const DEFAULT_AUTO_RETRY_MAX_ATTEMPTS = 2;
export const PROVIDER_NETWORK_AUTO_RETRY_MAX_ATTEMPTS = 3;
export const AUTO_RETRY_BACKOFF_BASE_MS = 1_000;
export const AUTO_RETRY_BACKOFF_MAX_MS = 30_000;

export function autoRetryMaxAttempts(
  reason: AutoRetryFailureReason,
  configured = DEFAULT_AUTO_RETRY_MAX_ATTEMPTS,
): number {
  const budget = Math.max(1, Math.floor(configured));
  if (budget <= 1) return budget;
  return reason === 'provider_network'
    ? Math.max(budget, PROVIDER_NETWORK_AUTO_RETRY_MAX_ATTEMPTS)
    : budget;
}

/** Delay before the child after a failed attempt. Attempt 1 retries now;
 * later attempts use bounded exponential backoff. */
export function autoRetryBackoffMs(failedAttempt: number): number {
  if (!Number.isFinite(failedAttempt) || failedAttempt <= 1) return 0;
  const exponent = Math.max(0, Math.floor(failedAttempt) - 2);
  return Math.min(
    AUTO_RETRY_BACKOFF_MAX_MS,
    AUTO_RETRY_BACKOFF_BASE_MS * 2 ** exponent,
  );
}

export type ClassifyFailureHints = {
  status?: string;
  explicitReason?: AgentRunFailureReason | null;
};

/**
 * 将 error 文本（+ 可选 hints）映射为 AgentRunFailureReason。
 * - hints.explicitReason 非空时直接采用（写路径已知原因）
 * - 否则按规则表匹配 error
 * - status===cancelled 且无串匹配时回落 cancelled
 * - 默认 exec_error
 */
export function classifyFailure(
  error: string | null | undefined,
  hints?: ClassifyFailureHints,
): AgentRunFailureReason {
  if (hints?.explicitReason) {
    return hints.explicitReason;
  }

  const e = (error ?? '').trim();
  if (e) {
    // 1. user_aborted（比 cancelled 更具体）
    if (
      /aborted by user|user\s*abort|user\s*cancel|cancelled by user|canceled by user/i.test(e)
    ) {
      return 'user_aborted';
    }
    // 2. cancelled
    if (/\bcancell?ed\b|\bcancel\b/i.test(e)) {
      return 'cancelled';
    }
    // 3. auth_required
    if (
      /\bunauthorized\b|\b401\b|auth(?:entication)?\s*required|login\s*required|not\s+logged\s+in|unauthenticated|\bauthentication\b/i.test(
        e,
      )
    ) {
      return 'auth_required';
    }
    // 4. quota_exceeded
    if (/\bquota\b|rate\s*limit|\b429\b|usage\s*limit|\bbilling\b/i.test(e)) {
      return 'quota_exceeded';
    }
    // 5. session_poisoned
    if (/session\s*poison|poison(?:ed)?\s*session|corrupt\s*session|resume.*poison|poison/i.test(e)) {
      return 'session_poisoned';
    }
    // A squad escalation is a durable routing outcome, not infrastructure;
    // check the prefix before matching an original provider reason.
    if (/squad\s*escalat/i.test(e)) {
      return 'squad_member_escalated';
    }
    // Infrastructure provider disconnects are retry-safe; classify before
    // generic timeout/exec_error so an ECONNRESET is not lost as unknown.
    if (
      /provider[_\s-]?network|network[_\s-]?error|fetch\s+failed|connection\s+(?:closed|reset|reset\s+by\s+peer)|network\s+(?:disconnect|unavailable|error)|econnreset|socket\s+hang\s*up|stream\s+(?:ended|closed)|\b(?:502|503|504)\b/i.test(
        e,
      )
    ) {
      return 'provider_network';
    }
    if (
      /runtime[_\s-]?offline|runtime\s+(?:is\s+)?offline|daemon\s+offline|agent\s+offline/i.test(
        e,
      )
    ) {
      return 'runtime_offline';
    }
    // 6. squad_member_escalated（结构化前缀，须先于 idle/timeout 等嵌套 original_reason）
    if (/squad\s*escalat/i.test(e)) {
      return 'squad_member_escalated';
    }
    // 7. tool_watchdog
    if (/tool\s*watchdog|tool_watchdog/i.test(e)) {
      return 'tool_watchdog';
    }
    // 8. idle_timeout（文案含 idle timeout）vs idle_watchdog
    if (/idle\s*timeout|idle_timeout/i.test(e)) {
      return 'idle_timeout';
    }
    if (/\bidle\b|idle_watchdog/i.test(e)) {
      return 'idle_watchdog';
    }
    // 9. waiting_local_directory_timeout
    if (
      /waiting_local_directory|waiting\s*local|local\s*directory\s*timeout|path.?lock.*timeout/i.test(
        e,
      )
    ) {
      return 'waiting_local_directory_timeout';
    }
    // 10. stale_heartbeat（orphan / heartbeat / stale: 前缀）
    if (/heartbeat|orphan|^stale:|stale_heartbeat/i.test(e)) {
      return 'stale_heartbeat';
    }
    // 11. timeout / timed out（通用硬超时；idle/tool 已在前）
    if (/timed?\s*out|\btimeout\b/i.test(e)) {
      return 'timeout';
    }
  }

  // status 轻量回落
  if (hints?.status === 'cancelled') {
    return 'cancelled';
  }

  return 'exec_error';
}

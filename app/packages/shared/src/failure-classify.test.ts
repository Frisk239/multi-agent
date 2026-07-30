import { describe, it, expect } from 'vitest';
import {
  autoRetryBackoffMs,
  autoRetryMaxAttempts,
  classifyFailure,
  isAutoRetryableFailureReason,
} from './failure-classify';
import type { AgentRunFailureReason } from './schema';

describe('classifyFailure', () => {
  it('prefers hints.explicitReason over error text', () => {
    expect(
      classifyFailure('tool watchdog fired', {
        explicitReason: 'auth_required',
      }),
    ).toBe('auth_required');
  });

  it('defaults to exec_error for empty / unknown', () => {
    expect(classifyFailure(null)).toBe('exec_error');
    expect(classifyFailure(undefined)).toBe('exec_error');
    expect(classifyFailure('')).toBe('exec_error');
    expect(classifyFailure('something went wrong in step 3')).toBe('exec_error');
  });

  it('maps status cancelled when error empty', () => {
    expect(classifyFailure(null, { status: 'cancelled' })).toBe('cancelled');
  });

  const cases: Array<[string, AgentRunFailureReason]> = [
    // new tiers
    ['aborted by user during tool call', 'user_aborted'],
    ['User cancelled the operation', 'user_aborted'],
    ['run cancelled by operator', 'cancelled'],
    ['Operation was canceled', 'cancelled'],
    ['Unauthorized: please re-login', 'auth_required'],
    ['HTTP 401 from provider', 'auth_required'],
    ['authentication required before resume', 'auth_required'],
    ['not logged in to claude', 'auth_required'],
    ['rate limit exceeded (429)', 'quota_exceeded'],
    ['quota exhausted for this key', 'quota_exceeded'],
    ['usage limit reached; billing issue', 'quota_exceeded'],
    ['session poisoned after resume', 'session_poisoned'],
    ['corrupt session state', 'session_poisoned'],
    ['resume failed: poison marker', 'session_poisoned'],
    // old tiers
    ['stale: tool watchdog (tool Bash in flight, no events for 2h)', 'tool_watchdog'],
    ['tool_watchdog triggered', 'tool_watchdog'],
    ['stale: idle timeout (no agent events for 30m)', 'idle_timeout'],
    ['idle timeout exceeded', 'idle_timeout'],
    ['stale: idle watchdog', 'idle_watchdog'],
    ['idle agent with no progress', 'idle_watchdog'],
    ['waiting_local_directory exceeded wall', 'waiting_local_directory_timeout'],
    ['path-lock waiting local directory timeout', 'waiting_local_directory_timeout'],
    ['stale: heartbeat timeout', 'stale_heartbeat'],
    ['orphan: no live executor', 'stale_heartbeat'],
    ['CLI exceeded wall clock timeout', 'timeout'],
    ['process timed out after 600s', 'timeout'],
    ['[Squad Escalated] original_reason: idle_timeout', 'squad_member_escalated'],
    ['runtime offline: daemon disconnected', 'runtime_offline'],
    ['provider_network: connection closed mid-response', 'provider_network'],
    ['ECONNRESET while reading provider stream', 'provider_network'],
    ['[Squad Escalated] original_reason: provider_network', 'squad_member_escalated'],
  ];

  it.each(cases)('classifies %j → %s', (error, expected) => {
    expect(classifyFailure(error)).toBe(expected);
  });

  it('orders user_aborted before cancelled', () => {
    expect(classifyFailure('cancelled by user')).toBe('user_aborted');
  });

  it('orders tool_watchdog before idle/timeout', () => {
    expect(
      classifyFailure('stale: tool watchdog (tool X in flight, timeout-like)'),
    ).toBe('tool_watchdog');
  });

  it('orders idle_timeout before generic timeout', () => {
    expect(classifyFailure('idle timeout (no events)')).toBe('idle_timeout');
  });

  it('keeps auto-retry allowlist narrow and backoff bounded', () => {
    expect(isAutoRetryableFailureReason('timeout')).toBe(true);
    expect(isAutoRetryableFailureReason('exec_error')).toBe(false);
    expect(isAutoRetryableFailureReason('idle_timeout')).toBe(false);
    expect(autoRetryMaxAttempts('timeout')).toBe(2);
    expect(autoRetryMaxAttempts('provider_network')).toBe(3);
    expect(autoRetryMaxAttempts('timeout', 1)).toBe(1);
    expect(autoRetryBackoffMs(1)).toBe(0);
    expect(autoRetryBackoffMs(2)).toBe(1_000);
    expect(autoRetryBackoffMs(20)).toBe(30_000);
  });
});

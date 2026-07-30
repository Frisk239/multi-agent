import { AgentRunFailureReason } from '@ma/shared';
import type { AgentRunFailureReason as AgentRunFailureReasonType } from '@ma/shared';

type RunLike = {
  status: string;
  createdAt: number;
  waitingLocalEnteredAt?: number | null;
  lastHeartbeatAt?: number | null;
  startedAt?: number | null;
  nextAttemptAt?: number | null;
  failureReason?: string | null;
  error?: string | null;
};

export type RunTerminalReason = AgentRunFailureReasonType | 'completed' | 'failed' | 'cancelled' | 'timed_out';

export type RunObservability = {
  queueAgeMs: number | null;
  queueEligibleAt: number | null;
  queueBlockedReason: 'retry_backoff' | null;
  heartbeatAgeMs: number | null;
  terminalReason: RunTerminalReason | null;
};

function ageMs(now: number, at: number | null | undefined): number | null {
  return at == null ? null : Math.max(0, now - at);
}

function terminalReason(row: RunLike): RunTerminalReason | null {
  if (row.status !== 'completed' && row.status !== 'failed' && row.status !== 'cancelled' && row.status !== 'timed_out') {
    return null;
  }
  const knownFailureReason =
    row.failureReason != null &&
    (AgentRunFailureReason.options as readonly string[]).includes(row.failureReason);
  // Cancellation is written by a separate CAS path, so an old/stale failure
  // reason must not override the durable cancelled status.
  if (row.status === 'cancelled') {
    return knownFailureReason && (row.failureReason === 'cancelled' || row.failureReason === 'user_aborted')
      ? (row.failureReason as RunTerminalReason)
      : 'cancelled';
  }
  if (knownFailureReason) return row.failureReason as RunTerminalReason;
  if (row.status === 'completed') return 'completed';
  if (row.status === 'timed_out') return 'timed_out';
  return 'failed';
}

export function deriveRunObservability(row: RunLike, now = Date.now()): RunObservability {
  const queueStatus = row.status === 'queued' || row.status === 'waiting_local_directory';
  const queueBlockedReason: 'retry_backoff' | null =
    queueStatus && row.nextAttemptAt != null && row.nextAttemptAt > now
      ? 'retry_backoff'
      : null;
  return {
    queueAgeMs:
      row.status === 'queued'
        ? ageMs(now, row.createdAt)
        : row.status === 'waiting_local_directory'
          ? ageMs(now, row.waitingLocalEnteredAt ?? row.createdAt)
          : null,
    queueEligibleAt: queueStatus ? (row.nextAttemptAt ?? null) : null,
    queueBlockedReason,
    heartbeatAgeMs:
      row.status === 'running'
        ? ageMs(now, row.lastHeartbeatAt ?? row.startedAt ?? row.createdAt)
        : null,
    terminalReason: terminalReason(row),
  };
}

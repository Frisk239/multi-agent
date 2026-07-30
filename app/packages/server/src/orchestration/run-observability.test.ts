import { describe, expect, it } from 'vitest';
import { deriveRunObservability } from './run-observability.js';

describe('deriveRunObservability', () => {
  const now = 100_000;

  it('uses queue entry timestamps for queued and waiting runs', () => {
    expect(
      deriveRunObservability(
        { status: 'queued', createdAt: 90_000 },
        now,
      ),
    ).toMatchObject({ queueAgeMs: 10_000, heartbeatAgeMs: null, terminalReason: null });
    expect(
      deriveRunObservability(
        { status: 'waiting_local_directory', createdAt: 70_000, waitingLocalEnteredAt: 95_000 },
        now,
      ),
    ).toMatchObject({ queueAgeMs: 5_000 });
  });

  it('falls back to started/created timestamps for running heartbeat age', () => {
    expect(
      deriveRunObservability({ status: 'running', createdAt: 80_000, startedAt: 88_000 }, now),
    ).toMatchObject({ heartbeatAgeMs: 12_000 });
  });

  it('projects stable terminal reasons without trusting unknown legacy strings', () => {
    expect(
      deriveRunObservability({ status: 'completed', createdAt: 1_000 }, now).terminalReason,
    ).toBe('completed');
    expect(
      deriveRunObservability({ status: 'failed', createdAt: 1_000, failureReason: 'timeout' }, now)
        .terminalReason,
    ).toBe('timeout');
    expect(
      deriveRunObservability({ status: 'failed', createdAt: 1_000, failureReason: 'legacy_reason' }, now)
        .terminalReason,
    ).toBe('failed');
    expect(
      deriveRunObservability({ status: 'cancelled', createdAt: 1_000, failureReason: 'timeout' }, now)
        .terminalReason,
    ).toBe('cancelled');
  });

  it('marks an auto-retry child as blocked until nextAttemptAt', () => {
    expect(
      deriveRunObservability(
        { status: 'queued', createdAt: 80_000, nextAttemptAt: 105_000 },
        now,
      ),
    ).toMatchObject({
      queueAgeMs: 20_000,
      queueEligibleAt: 105_000,
      queueBlockedReason: 'retry_backoff',
    });
    expect(
      deriveRunObservability(
        { status: 'queued', createdAt: 80_000, nextAttemptAt: 99_000 },
        now,
      ),
    ).toMatchObject({ queueBlockedReason: null, queueEligibleAt: 99_000 });
  });
});

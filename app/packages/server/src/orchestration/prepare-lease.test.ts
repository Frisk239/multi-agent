/**
 * Slice 68 · prepareLeaseExpiresAt：
 * - claim 写 lease
 * - 稳定 running 清 null
 * - 过期半 claim → fail（不 requeue）
 * - 未过期 / 已清 lease 不受损
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  abortRun: vi.fn(),
  notifyRunTerminal: vi.fn(),
  hasRunAbort: vi.fn((_runId?: string) => false),
}));

const testState = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!testState.db) throw new Error('test db not ready');
    return testState.db;
  },
}));

vi.mock('./event-bus.js', () => ({
  eventBus: {
    publish: (...args: unknown[]) => mocks.publish(...args),
  },
}));

vi.mock('./run-control.js', () => ({
  abortRun: (...args: unknown[]) => mocks.abortRun(...args),
  hasRunAbort: vi.fn((runId: string) => Boolean(mocks.hasRunAbort(runId))),
  registerRunAbort: vi.fn(),
  clearRunAbort: vi.fn(),
}));

vi.mock('./inbox-writer.js', () => ({
  notifyRunTerminal: (...args: unknown[]) => mocks.notifyRunTerminal(...args),
  notifyEnqueueSkipped: vi.fn(),
  notifyCommentCreated: vi.fn(),
  notifyDeferredUnclaimed: vi.fn(),
  notifySquadEscalated: vi.fn(),
}));

vi.mock('./tool-watchdog-state.js', () => ({
  clearToolInflight: vi.fn(),
  getToolInflight: vi.fn(() => ({ depth: 0, lastToolName: null })),
  noteToolStart: vi.fn(),
  noteToolEnd: vi.fn(),
}));

import { transitionRun, CLAIMABLE_RUN_STATUSES } from './run-transitions.js';
import {
  DEFAULT_PREPARE_LEASE_MS,
  failStalePrepareLeaseRuns,
  getPrepareLeaseMs,
} from './stale-runs.js';

describe('prepareLeaseExpiresAt (Slice 68)', () => {
  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    mocks.publish.mockReset();
    mocks.abortRun.mockReset();
    mocks.notifyRunTerminal.mockReset();
    mocks.hasRunAbort.mockReset();
    mocks.hasRunAbort.mockReturnValue(false);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
    vi.unstubAllEnvs();
  });

  function insertQueuedRun(id: string, createdAt = Date.now()) {
    testState
      .db!.insert(agentRuns)
      .values({
        id,
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'queued',
        kind: 'issue',
        error: null,
        startedAt: null,
        finishedAt: null,
        isLeader: 0,
        squadId: null,
        waitingLocalEnteredAt: null,
        prepareLeaseExpiresAt: null,
        createdAt,
      })
      .run();
  }

  it('exports default prepare lease 120s and env override', () => {
    expect(DEFAULT_PREPARE_LEASE_MS).toBe(120_000);
    expect(getPrepareLeaseMs()).toBe(120_000);
    vi.stubEnv('MA_PREPARE_LEASE_MS', '60000');
    expect(getPrepareLeaseMs()).toBe(60_000);
    vi.stubEnv('MA_PREPARE_LEASE_MS', '0');
    expect(getPrepareLeaseMs()).toBe(0);
  });

  it('claim → running writes prepareLeaseExpiresAt = now + leaseMs', () => {
    const id = 'run-claim-lease';
    insertQueuedRun(id);
    const now = 5_000_000;
    const leaseMs = getPrepareLeaseMs();

    const claim = transitionRun({
      id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      patch: {
        status: 'running',
        startedAt: now,
        lastHeartbeatAt: now,
        waitingLocalEnteredAt: null,
        prepareLeaseExpiresAt: now + leaseMs,
      },
    });

    expect(claim.applied).toBe(true);
    expect(claim.row?.status).toBe('running');
    expect(claim.row?.prepareLeaseExpiresAt).toBe(now + leaseMs);
    expect(toAgentRun(claim.row!).prepareLeaseExpiresAt).toBe(now + leaseMs);
  });

  it('stable running clears prepareLeaseExpiresAt (null)', () => {
    const id = 'run-stable-clear';
    insertQueuedRun(id);
    const now = 5_000_000;
    transitionRun({
      id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      patch: {
        status: 'running',
        startedAt: now,
        lastHeartbeatAt: now,
        prepareLeaseExpiresAt: now + 120_000,
      },
    });

    // 模拟 registerRunAbort 后清 lease
    testState
      .db!.update(agentRuns)
      .set({ prepareLeaseExpiresAt: null })
      .where(eq(agentRuns.id, id))
      .run();

    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('running');
    expect(row?.prepareLeaseExpiresAt).toBeNull();
    expect(toAgentRun(row!).prepareLeaseExpiresAt).toBeNull();
  });

  it('fails expired prepare lease half-claim (running + lease < now)', () => {
    const id = 'run-lease-expired';
    insertQueuedRun(id);
    const now = 10_000_000;
    const expiredAt = now - 1;
    transitionRun({
      id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      patch: {
        status: 'running',
        startedAt: now - 200_000,
        lastHeartbeatAt: now - 200_000,
        prepareLeaseExpiresAt: expiredAt,
      },
    });

    const n = failStalePrepareLeaseRuns(now);
    expect(n).toBe(1);

    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('failed');
    expect(row?.failureReason).toBe('exec_error');
    expect(row?.error).toContain('prepare_lease');
    expect(row?.prepareLeaseExpiresAt).toBeNull();
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run:failed' }),
    );
    expect(mocks.notifyRunTerminal).toHaveBeenCalledTimes(1);
    expect(mocks.abortRun).toHaveBeenCalledWith(id);
  });

  it('does not fail unexpired prepare lease', () => {
    const id = 'run-lease-fresh';
    insertQueuedRun(id);
    const now = 10_000_000;
    transitionRun({
      id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      patch: {
        status: 'running',
        startedAt: now - 1_000,
        lastHeartbeatAt: now - 1_000,
        prepareLeaseExpiresAt: now + 60_000,
      },
    });

    expect(failStalePrepareLeaseRuns(now)).toBe(0);
    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('running');
    expect(row?.prepareLeaseExpiresAt).toBe(now + 60_000);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('does not fail stable running (lease already null)', () => {
    const id = 'run-stable-ok';
    insertQueuedRun(id);
    const now = 10_000_000;
    transitionRun({
      id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      patch: {
        status: 'running',
        startedAt: now - 300_000,
        lastHeartbeatAt: now,
        prepareLeaseExpiresAt: null,
      },
    });

    expect(failStalePrepareLeaseRuns(now)).toBe(0);
    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('running');
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('does not touch queued runs without lease', () => {
    const id = 'run-queued-only';
    insertQueuedRun(id, 1);
    expect(failStalePrepareLeaseRuns(Date.now())).toBe(0);
    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('queued');
  });
});

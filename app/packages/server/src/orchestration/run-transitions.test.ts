import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns } from '../db/schema.js';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  abortRun: vi.fn(),
  wakeRunWorker: vi.fn(),
  notifyRunTerminal: vi.fn(),
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
  hasRunAbort: vi.fn(() => false),
  registerRunAbort: vi.fn(),
  clearRunAbort: vi.fn(),
}));

vi.mock('./run-worker.js', () => ({
  wakeRunWorker: (...args: unknown[]) => mocks.wakeRunWorker(...args),
  failRun: vi.fn(),
}));

vi.mock('./inbox-writer.js', () => ({
  notifyRunTerminal: (...args: unknown[]) => mocks.notifyRunTerminal(...args),
  notifyEnqueueSkipped: vi.fn(),
  notifyCommentCreated: vi.fn(),
}));

vi.mock('./readiness.js', () => ({
  computeAgentReadiness: vi.fn(),
}));

vi.mock('../db/squad-loader.js', () => ({
  loadSquadDetail: vi.fn(),
}));

import { transitionRun, CLAIMABLE_RUN_STATUSES } from './run-transitions.js';
import { cancelRunById } from './run-service.js';

describe('run-transitions (Slice 39)', () => {
  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    mocks.publish.mockReset();
    mocks.abortRun.mockReset();
    mocks.wakeRunWorker.mockReset();
    mocks.notifyRunTerminal.mockReset();
  });

  afterEach(() => {
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
  });

  function insertQueuedRun(id: string) {
    const now = Date.now();
    testState.db!.insert(agentRuns)
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
        createdAt: now,
      })
      .run();
  }

  it('double claim: only one applied=true', () => {
    const id = 'run-claim-1';
    insertQueuedRun(id);
    const now = Date.now();

    const a = transitionRun({
      id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      patch: { status: 'running', startedAt: now, lastHeartbeatAt: now },
    });
    const b = transitionRun({
      id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      patch: { status: 'running', startedAt: now + 1, lastHeartbeatAt: now + 1 },
    });

    expect(a.applied).toBe(true);
    expect(a.row?.status).toBe('running');
    expect(b.applied).toBe(false);
    expect(b.row).toBeUndefined();

    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('running');
    expect(row?.startedAt).toBe(now);
  });

  it('cancel on completed run does not publish run:cancelled or abort', () => {
    const id = 'run-cancel-done';
    insertQueuedRun(id);
    const now = Date.now();
    testState.db!
      .update(agentRuns)
      .set({ status: 'completed', finishedAt: now })
      .where(eq(agentRuns.id, id))
      .run();

    const res = cancelRunById(id);
    expect(res.ok).toBe(false);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.abortRun).not.toHaveBeenCalled();
  });

  it('cancel on active run applies once and publishes run:cancelled', () => {
    const id = 'run-cancel-active';
    insertQueuedRun(id);

    const res = cancelRunById(id);
    expect(res.ok).toBe(true);
    expect(res.run?.status).toBe('cancelled');
    expect(mocks.abortRun).toHaveBeenCalledWith(id);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run:cancelled' }),
    );

    // second cancel is 0-change
    mocks.publish.mockClear();
    mocks.abortRun.mockClear();
    const res2 = cancelRunById(id);
    expect(res2.ok).toBe(false);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.abortRun).not.toHaveBeenCalled();
  });
});

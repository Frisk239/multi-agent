/**
 * Slice 66 · waitingLocalEnteredAt：进入 waiting 写时刻；离开清 null。
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
  clearToolInflight: vi.fn(),
}));

vi.mock('./inbox-writer.js', () => ({
  notifyRunTerminal: (...args: unknown[]) => mocks.notifyRunTerminal(...args),
  notifyEnqueueSkipped: vi.fn(),
  notifyCommentCreated: vi.fn(),
}));

import { transitionRun, CLAIMABLE_RUN_STATUSES } from './run-transitions.js';
import { cancelRunById } from './run-service.js';
import { failStaleWaitingLocalDirectoryRuns } from './stale-runs.js';

describe('waitingLocalEnteredAt (Slice 66)', () => {
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
        createdAt,
      })
      .run();
  }

  it('writes waitingLocalEnteredAt when entering waiting_local_directory', () => {
    const id = 'run-wait-enter';
    insertQueuedRun(id);
    const now = 5_000_000;

    const tr = transitionRun({
      id,
      fromStatuses: ['queued'],
      patch: {
        status: 'waiting_local_directory',
        lastHeartbeatAt: now,
        waitingLocalEnteredAt: now,
        cwdPath: '/tmp/repo',
        cwdMode: 'project_local',
      },
    });

    expect(tr.applied).toBe(true);
    expect(tr.row?.status).toBe('waiting_local_directory');
    expect(tr.row?.waitingLocalEnteredAt).toBe(now);

    const api = toAgentRun(tr.row!);
    expect(api.waitingLocalEnteredAt).toBe(now);
  });

  it('clears waitingLocalEnteredAt when claim → running', () => {
    const id = 'run-wait-claim';
    insertQueuedRun(id);
    const entered = 5_000_000;
    transitionRun({
      id,
      fromStatuses: ['queued'],
      patch: {
        status: 'waiting_local_directory',
        lastHeartbeatAt: entered,
        waitingLocalEnteredAt: entered,
      },
    });

    const claimAt = entered + 30_000;
    const claim = transitionRun({
      id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      patch: {
        status: 'running',
        startedAt: claimAt,
        lastHeartbeatAt: claimAt,
        waitingLocalEnteredAt: null,
      },
    });

    expect(claim.applied).toBe(true);
    expect(claim.row?.status).toBe('running');
    expect(claim.row?.waitingLocalEnteredAt).toBeNull();
    expect(toAgentRun(claim.row!).waitingLocalEnteredAt).toBeNull();
  });

  it('clears waitingLocalEnteredAt on cancel from waiting', () => {
    const id = 'run-wait-cancel';
    insertQueuedRun(id);
    const entered = Date.now();
    transitionRun({
      id,
      fromStatuses: ['queued'],
      patch: {
        status: 'waiting_local_directory',
        lastHeartbeatAt: entered,
        waitingLocalEnteredAt: entered,
      },
    });

    const res = cancelRunById(id);
    expect(res.ok).toBe(true);
    expect(res.run?.status).toBe('cancelled');
    expect(res.run?.waitingLocalEnteredAt).toBeNull();

    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.waitingLocalEnteredAt).toBeNull();
  });

  it('stale wall clock prefers waitingLocalEnteredAt over createdAt', () => {
    const id = 'run-wait-stale-entered';
    const now = 10_000_000;
    // created long ago, but only recently entered waiting → should NOT time out
    // when entered is recent (DEFAULT_WAITING_LOCAL_MAX_MS = 2h)
    const createdAt = now - 3 * 60 * 60 * 1000; // 3h ago
    const entered = now - 60_000; // 1 min ago
    testState
      .db!.insert(agentRuns)
      .values({
        id,
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'waiting_local_directory',
        kind: 'issue',
        error: null,
        startedAt: null,
        finishedAt: null,
        isLeader: 0,
        squadId: null,
        waitingLocalEnteredAt: entered,
        createdAt,
      })
      .run();

    const n = failStaleWaitingLocalDirectoryRuns(now);
    expect(n).toBe(0);
    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('waiting_local_directory');
    expect(row?.waitingLocalEnteredAt).toBe(entered);
  });

  it('stale wall clock times out using waitingLocalEnteredAt and clears field', () => {
    const id = 'run-wait-stale-old-entered';
    const now = 10_000_000;
    // DEFAULT_WAITING_LOCAL_MAX_MS = 2h
    const entered = now - 2 * 60 * 60 * 1000 - 1;
    testState
      .db!.insert(agentRuns)
      .values({
        id,
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'waiting_local_directory',
        kind: 'issue',
        error: null,
        startedAt: null,
        finishedAt: null,
        isLeader: 0,
        squadId: null,
        waitingLocalEnteredAt: entered,
        createdAt: entered - 60_000,
      })
      .run();

    const n = failStaleWaitingLocalDirectoryRuns(now);
    expect(n).toBe(1);
    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('timed_out');
    expect(row?.waitingLocalEnteredAt).toBeNull();
    expect(row?.failureReason).toBe('waiting_local_directory_timeout');
  });

  it('migration leaves null for legacy rows; API maps null', () => {
    const id = 'run-legacy-null';
    insertQueuedRun(id, Date.now() - 1000);
    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get()!;
    expect(row.waitingLocalEnteredAt == null).toBe(true);
    expect(toAgentRun(row).waitingLocalEnteredAt).toBeNull();
  });
});

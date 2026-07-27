/**
 * Slice 67 · forceFresh：enqueue 标记 + resolvePriorSession 跳过 resume。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, runMessages } from '../db/schema.js';
import { resolvePriorSession } from '../runtime/session-resume.js';
import { toAgentRun } from '../db/reshape.js';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  abortRun: vi.fn(),
  wakeRunWorker: vi.fn(),
  notifyEnqueueSkipped: vi.fn(),
  computeAgentReadiness: vi.fn(),
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

vi.mock('./run-worker.js', () => ({
  wakeRunWorker: (...args: unknown[]) => mocks.wakeRunWorker(...args),
}));

vi.mock('./inbox-writer.js', () => ({
  notifyEnqueueSkipped: (...args: unknown[]) => mocks.notifyEnqueueSkipped(...args),
  notifyRunTerminal: vi.fn(),
  notifyCommentCreated: vi.fn(),
}));

vi.mock('./readiness.js', () => ({
  computeAgentReadiness: (...args: unknown[]) => mocks.computeAgentReadiness(...args),
}));

import { rerunIssue, retryRun } from './run-service.js';

describe('forceFresh (Slice 67)', () => {
  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    mocks.publish.mockReset();
    mocks.abortRun.mockReset();
    mocks.wakeRunWorker.mockReset();
    mocks.notifyEnqueueSkipped.mockReset();
    mocks.computeAgentReadiness.mockReset();
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(() => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
  });

  function insertFailedRun(opts: {
    id: string;
    runtime?: 'claude-code' | 'opencode';
    agentId?: string;
    providerSessionId?: string | null;
    sessionPoisoned?: number;
    failureReason?: string | null;
  }) {
    const now = Date.now();
    testState
      .db!.insert(agentRuns)
      .values({
        id: opts.id,
        issueId: 'iss-test-1',
        agentId: opts.agentId ?? 'agt-test-2',
        runtime: opts.runtime ?? 'claude-code',
        status: 'failed',
        kind: 'issue',
        error: 'session poisoned',
        failureReason: opts.failureReason ?? 'session_poisoned',
        startedAt: now - 1000,
        finishedAt: now,
        isLeader: 0,
        squadId: null,
        providerSessionId: opts.providerSessionId ?? 'sess-poisoned-1',
        sessionPoisoned: opts.sessionPoisoned ?? 1,
        sessionResumeStatus: 'resume_miss',
        createdAt: now - 1000,
      })
      .run();
  }

  it('retryRun forceFresh=true writes sessionResumeStatus=force_fresh and system note', async () => {
    insertFailedRun({ id: 'run-src-ff' });

    const res = await retryRun('run-src-ff', { forceFresh: true });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);

    expect(res.run.sessionResumeStatus).toBe('force_fresh');
    expect(res.run.rerunOfRunId).toBe('run-src-ff');

    const row = testState
      .db!.select()
      .from(agentRuns)
      .where(eq(agentRuns.id, res.run.id))
      .get()!;
    expect(row.sessionResumeStatus).toBe('force_fresh');
    expect(row.rerunOfRunId).toBe('run-src-ff');

    const notes = testState
      .db!.select()
      .from(runMessages)
      .where(eq(runMessages.runId, res.run.id))
      .all();
    expect(notes.some((n) => n.kind === 'system' && /force_fresh/.test(n.body))).toBe(
      true,
    );
  });

  it('retryRun without forceFresh does not set force_fresh', async () => {
    insertFailedRun({ id: 'run-src-normal' });

    const res = await retryRun('run-src-normal');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);

    expect(res.run.sessionResumeStatus).not.toBe('force_fresh');
    const row = testState
      .db!.select()
      .from(agentRuns)
      .where(eq(agentRuns.id, res.run.id))
      .get()!;
    expect(row.sessionResumeStatus == null || row.sessionResumeStatus === '').toBe(true);
  });

  it('resolvePriorSession skips resume when enqueue marked force_fresh (even with prior session)', async () => {
    // prior completed run with session
    const now = Date.now();
    testState
      .db!.insert(agentRuns)
      .values({
        id: 'run-prior-ok',
        issueId: 'iss-test-1',
        agentId: 'agt-test-2',
        runtime: 'claude-code',
        status: 'completed',
        kind: 'issue',
        error: null,
        startedAt: now - 5000,
        finishedAt: now - 4000,
        isLeader: 0,
        squadId: null,
        providerSessionId: 'sess-should-not-bind',
        sessionPoisoned: 0,
        sessionResumeStatus: 'resumed',
        createdAt: now - 5000,
      })
      .run();

    insertFailedRun({
      id: 'run-src-2',
      sessionPoisoned: 0,
      providerSessionId: 'sess-old',
      failureReason: 'exec_error',
    });

    const res = await retryRun('run-src-2', { forceFresh: true });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);

    const decision = resolvePriorSession({
      id: res.run.id,
      runtime: 'claude-code',
      agentId: 'agt-test-2',
      issueId: 'iss-test-1',
      kind: 'issue',
      rerunOfRunId: 'run-src-2',
      sessionResumeStatus: res.run.sessionResumeStatus,
    });
    expect(decision.resumeSessionId).toBeNull();
    expect(decision.status).toBe('force_fresh');

    // 对照：无 force 时会尝试 resume
    const normal = resolvePriorSession({
      id: 'run-hypothetical',
      runtime: 'claude-code',
      agentId: 'agt-test-2',
      issueId: 'iss-test-1',
      kind: 'issue',
      rerunOfRunId: 'run-prior-ok',
    });
    expect(normal.resumeSessionId).toBe('sess-should-not-bind');
    expect(normal.status).toBe('resumed');
  });

  it('rerunIssue opts.forceFresh marks new run', async () => {
    insertFailedRun({ id: 'run-src-3' });
    const res = await rerunIssue('iss-test-1', {
      sourceRunId: 'run-src-3',
      forceFresh: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(toAgentRun(
      testState.db!.select().from(agentRuns).where(eq(agentRuns.id, res.run.id)).get()!,
    ).sessionResumeStatus).toBe('force_fresh');
  });
});

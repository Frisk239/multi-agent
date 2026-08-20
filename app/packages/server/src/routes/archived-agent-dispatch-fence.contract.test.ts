/**
 * G8-7: archive is a dispatch lifecycle fence, not a cosmetic roster filter.
 * This drives real Fastify handlers against migrated SQLite; workers and CLI
 * execution are mocked so the test is deterministic and never starts a CLI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { LOCAL_MEMBER } from '../local-member.js';
import {
  agentRuns,
  agents,
  automationRules,
  automationRuns,
  issues,
} from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  sqlite: null as ReturnType<typeof createTestDb>['sqlite'] | null,
  cleanup: null as (() => void) | null,
  publish: vi.fn(),
  wake: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
  get sqlite() {
    if (!state.sqlite) throw new Error('test sqlite not ready');
    return state.sqlite;
  },
  getSqliteHardeningInfo: () => ({
    path: ':memory:',
    busyTimeoutMs: 5_000,
    journalMode: 'memory',
    foreignKeys: true,
  }),
  resolveAssigneeLabel: () => 'Test Agent',
  resolveAuthorLabel: () => 'Test User',
}));

vi.mock('../orchestration/event-bus.js', () => ({
  eventBus: { publish: (...args: unknown[]) => state.publish(...args), on: vi.fn() },
}));
vi.mock('../orchestration/run-worker.js', () => ({
  wakeRunWorker: (...args: unknown[]) => state.wake(...args),
}));
vi.mock('../orchestration/inbox-writer.js', () => ({
  notifyEnqueueSkipped: vi.fn(),
  notifyRunTerminal: vi.fn(),
  notifyCommentCreated: vi.fn(),
  ensureIssueSubscriber: vi.fn(),
  notifyAssigned: vi.fn(),
}));

import { buildApp } from '../app.js';

const TARGET_AGENT_ID = 'agt-test-1';

function insertUnfinishedRun(
  id: string,
  status: 'queued' | 'waiting_local_directory' | 'deferred' | 'running',
): void {
  const now = Date.now();
  state.db!.insert(agentRuns).values({
    id,
    issueId: 'iss-test-1',
    agentId: TARGET_AGENT_ID,
    runtime: 'opencode',
    status,
    kind: 'issue',
    isLeader: 0,
    startedAt: status === 'running' ? now - 1_000 : null,
    lastHeartbeatAt: status === 'running' ? now : null,
    waitingLocalEnteredAt: status === 'waiting_local_directory' ? now - 1_000 : null,
    fireAt: status === 'deferred' ? now + 60_000 : null,
    createdAt: now,
  }).run();
}

function statusOf(id: string): string | undefined {
  return state.db!
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .get()?.status;
}

describe('G8-7 archived Agent dispatch fence (Fastify + real SQLite)', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.sqlite = t.sqlite;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    state.publish.mockReset();
    state.wake.mockReset();
    // Deliberately turn on the historical readiness escape hatch. Archive must
    // still win before it, and no test command may spawn a runtime CLI.
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    state.cleanup?.();
    state.cleanup = null;
    state.sqlite = null;
    state.db = null;
  });

  it('PATCH/soft DELETE converge, cancel every unfinished status, preserve history, reject future dispatch, and unarchive only reopens enqueue', async () => {
    insertUnfinishedRun('run-archive-queued', 'queued');
    insertUnfinishedRun('run-archive-waiting', 'waiting_local_directory');
    insertUnfinishedRun('run-archive-deferred', 'deferred');
    insertUnfinishedRun('run-archive-running', 'running');

    app = await buildApp();
    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/agents/${TARGET_AGENT_ID}`,
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);
    const archivedBody = archived.json() as { archivedAt: string | null };
    expect(archivedBody.archivedAt).toBeTruthy();
    const archivedAt = state.db!
      .select()
      .from(agents)
      .where(eq(agents.id, TARGET_AGENT_ID))
      .get()!.archivedAt;

    for (const id of [
      'run-archive-queued',
      'run-archive-waiting',
      'run-archive-deferred',
      'run-archive-running',
    ]) {
      expect(statusOf(id)).toBe('cancelled');
    }
    expect(state.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run:cancelled' }),
    );

    // History remains addressable even though future work is closed.
    const history = await app.inject({
      method: 'GET',
      url: `/api/agents/${TARGET_AGENT_ID}/runs?limit=20`,
    });
    expect(history.statusCode).toBe(200);
    expect((history.json() as Array<{ id: string; status: string }>)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'run-archive-queued', status: 'cancelled' }),
        expect.objectContaining({ id: 'run-archive-running', status: 'cancelled' }),
      ]),
    );

    const readiness = await app.inject({
      method: 'GET',
      url: `/api/agents/${TARGET_AGENT_ID}/readiness`,
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({ status: 'archived', slotsAvailable: 0 });

    const quickRejected = await app.inject({
      method: 'POST',
      url: '/api/quick-runs',
      payload: {
        prompt: 'must not queue for archived agent',
        assignee: { type: 'agent', id: TARGET_AGENT_ID },
      },
    });
    expect(quickRejected.statusCode).toBe(409);
    expect(quickRejected.json()).toMatchObject({
      code: 'readiness_failed',
      reason: 'agent_archived',
      enqueue: { status: 'skipped', reason: 'agent_archived' },
    });

    // Create Issue intentionally remains an auditable product action (the
    // longstanding offline contract), but center enqueue returns the same
    // lifecycle reason and never creates a run.
    const issueCountBefore = state.db!.select().from(issues).all().length;
    const agentRunCountBeforeCreate = state.db!.select().from(agentRuns).all().length;
    const issueCreated = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: {
        title: 'must not assign archived Agent',
        assignee: { type: 'agent', id: TARGET_AGENT_ID },
      },
    });
    expect(issueCreated.statusCode).toBe(201);
    expect(issueCreated.json()).toMatchObject({
      enqueue: { status: 'skipped', reason: 'agent_archived' },
    });
    expect(state.db!.select().from(issues).all()).toHaveLength(issueCountBefore + 1);
    expect(state.db!.select().from(agentRuns).all()).toHaveLength(agentRunCountBeforeCreate);

    // Single Issue reassignment and bulk board assignment preflight the same
    // lifecycle gate before writing a false archived-assignee relationship.
    const nowForPreflight = Date.now();
    state.db!.insert(issues).values({
      id: 'iss-archive-preflight',
      workspaceId: 'ws-local',
      identifier: 'FRI-ARCHIVE-PREFLIGHT',
      title: 'unassigned preflight fixture',
      status: 'todo',
      priority: 'medium',
      creatorType: 'member',
      creatorId: LOCAL_MEMBER.id,
      position: -1,
      createdAt: nowForPreflight,
      updatedAt: nowForPreflight,
    }).run();
    const beforeSingle = state.db!
      .select()
      .from(issues)
      .where(eq(issues.id, 'iss-archive-preflight'))
      .get()!;
    const singleRejected = await app.inject({
      method: 'PUT',
      url: '/api/issues/iss-archive-preflight',
      payload: { assignee: { type: 'agent', id: TARGET_AGENT_ID } },
    });
    expect(singleRejected.statusCode).toBe(409);
    expect(singleRejected.json()).toMatchObject({
      code: 'readiness_failed',
      reason: 'agent_archived',
    });
    expect(
      state.db!.select().from(issues).where(eq(issues.id, 'iss-archive-preflight')).get(),
    ).toMatchObject({
      assigneeType: beforeSingle.assigneeType,
      assigneeId: beforeSingle.assigneeId,
    });

    const beforeBulk = state.db!
      .select()
      .from(issues)
      .where(eq(issues.id, 'iss-archive-preflight'))
      .get()!;
    const bulkRejected = await app.inject({
      method: 'POST',
      url: '/api/issues/bulk-assign',
      payload: {
        issueIds: ['iss-archive-preflight'],
        assigneeType: 'agent',
        assigneeId: TARGET_AGENT_ID,
      },
    });
    expect(bulkRejected.statusCode).toBe(409);
    expect(bulkRejected.json()).toMatchObject({
      code: 'readiness_failed',
      reason: 'agent_archived',
    });
    expect(
      state.db!.select().from(issues).where(eq(issues.id, 'iss-archive-preflight')).get(),
    ).toMatchObject({
      assigneeType: beforeBulk.assigneeType,
      assigneeId: beforeBulk.assigneeId,
    });

    // Run Now records the domain outcome (201 = audit row persisted), never a
    // fake launch. This also covers the run_only direct-insert path.
    const now = Date.now();
    state.db!.insert(automationRules).values({
      id: 'rule-archive-run-now',
      name: 'archived target',
      enabled: 1,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 15,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: TARGET_AGENT_ID,
      titleTemplate: 'must skip',
      bodyTemplate: '',
      executionMode: 'run_only',
      lastPlannedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();
    const runNow = await app.inject({
      method: 'POST',
      url: '/api/automation/rules/rule-archive-run-now/run-now',
    });
    expect(runNow.statusCode).toBe(201);
    expect(runNow.json()).toMatchObject({
      status: 'skipped',
      issueId: null,
      linkedRunId: null,
    });
    expect((runNow.json() as { error: string }).error).toContain('已归档');
    expect(
      state.db!.select().from(automationRuns).where(eq(automationRuns.ruleId, 'rule-archive-run-now')).all(),
    ).toHaveLength(1);

    // A repeat PATCH and soft DELETE are both lifecycle sweeps: a synthetic
    // legacy row cannot escape merely because archivedAt was already set.
    insertUnfinishedRun('run-archive-legacy-patch', 'deferred');
    const archiveAgain = await app.inject({
      method: 'PATCH',
      url: `/api/agents/${TARGET_AGENT_ID}`,
      payload: { archived: true },
    });
    expect(archiveAgain.statusCode).toBe(200);
    expect(statusOf('run-archive-legacy-patch')).toBe('cancelled');
    expect(
      state.db!.select().from(agents).where(eq(agents.id, TARGET_AGENT_ID)).get()!.archivedAt,
    ).toBe(archivedAt);

    insertUnfinishedRun('run-archive-legacy-delete', 'queued');
    const softDelete = await app.inject({
      method: 'DELETE',
      url: `/api/agents/${TARGET_AGENT_ID}`,
    });
    expect(softDelete.statusCode).toBe(204);
    expect(statusOf('run-archive-legacy-delete')).toBe('cancelled');

    const unarchived = await app.inject({
      method: 'PATCH',
      url: `/api/agents/${TARGET_AGENT_ID}`,
      payload: { archived: false },
    });
    expect(unarchived.statusCode).toBe(200);
    expect(unarchived.json()).toMatchObject({ archivedAt: null });
    // Unarchive intentionally does not resurrect historical cancelled work.
    expect(statusOf('run-archive-running')).toBe('cancelled');

    const quickAfterUnarchive = await app.inject({
      method: 'POST',
      url: '/api/quick-runs',
      payload: {
        prompt: 'new work after unarchive',
        assignee: { type: 'agent', id: TARGET_AGENT_ID },
      },
    });
    expect(quickAfterUnarchive.statusCode).toBe(201);
    expect(quickAfterUnarchive.json()).toMatchObject({ run: { status: 'queued' } });
    expect(state.wake).toHaveBeenCalled();
  });
});

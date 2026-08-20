/**
 * Automation rule archive contract.
 *
 * This intentionally drives the real Fastify routes over a migrator-created
 * in-memory SQLite database: archive must retain the complete rule → automation run →
 * Issue / AgentRun evidence chain while blocking new work.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import {
  agentRuns,
  automationRules,
  automationRuns,
  issues,
} from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
  sqlite: {
    prepare: () => ({ get: () => ({ '1': 1 }) }),
  },
  getSqliteHardeningInfo: () => ({
    path: ':memory:',
    busyTimeoutMs: 5000,
    journalMode: 'memory',
    foreignKeys: true,
  }),
  resolveAssigneeLabel: () => 'Test Agent',
  resolveAuthorLabel: () => 'Test User',
}));

vi.mock('../orchestration/event-bus.js', () => ({
  eventBus: { publish: vi.fn(), on: vi.fn() },
}));
vi.mock('../orchestration/run-worker.js', () => ({ wakeRunWorker: vi.fn() }));
vi.mock('../orchestration/inbox-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../orchestration/inbox-writer.js')>();
  return {
    ...actual,
    notifyEnqueueSkipped: vi.fn(),
    notifyRunTerminal: vi.fn(),
  };
});

import { buildApp } from '../app.js';

function seedArchiveHistory() {
  const now = Date.now();
  const ruleId = 'rule-archive-history';
  const issueId = 'iss-test-1';
  const agentRunId = 'run-archive-history';

  state.db!.insert(automationRules)
    .values({
      id: ruleId,
      name: '保留历史的规则',
      enabled: 1,
      archivedAt: null,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 15,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: 'agt-test-1',
      titleTemplate: 'archive {{date}}',
      bodyTemplate: '保留审计记录',
      executionMode: 'create_issue',
      lastPlannedAt: now - 30_000,
      createdAt: now - 60_000,
      updatedAt: now - 30_000,
    })
    .run();
  state.db!.insert(agentRuns)
    .values({
      id: agentRunId,
      issueId,
      agentId: 'agt-test-1',
      runtime: 'opencode',
      status: 'failed',
      kind: 'issue',
      quickPrompt: null,
      isLeader: 0,
      squadId: null,
      projectId: null,
      error: 'fixture failure',
      startedAt: now - 50_000,
      finishedAt: now - 40_000,
      lastHeartbeatAt: now - 45_000,
      createdAt: now - 50_000,
    })
    .run();
  state.db!.insert(automationRuns)
    .values([
      {
        id: 'auto-archive-failed',
        ruleId,
        plannedAt: now - 30_000,
        source: 'schedule',
        status: 'failed',
        issueId,
        linkedRunId: agentRunId,
        error: 'fixture failure',
        createdAt: now - 30_000,
        updatedAt: now - 30_000,
      },
      {
        id: 'auto-archive-skipped',
        ruleId,
        plannedAt: now - 20_000,
        source: 'schedule',
        status: 'skipped',
        issueId: null,
        linkedRunId: null,
        error: 'fixture skipped',
        createdAt: now - 20_000,
        updatedAt: now - 20_000,
      },
      {
        id: 'auto-archive-pending',
        ruleId,
        plannedAt: now - 10_000,
        source: 'manual',
        status: 'pending_dispatch',
        issueId,
        linkedRunId: null,
        error: 'fixture pending',
        createdAt: now - 10_000,
        updatedAt: now - 10_000,
      },
    ])
    .run();

  return { ruleId, issueId, agentRunId };
}

describe('automation rule archive preserves history', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(async () => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('archives atomically, keeps all audit evidence readable, and blocks new work', async () => {
    const { ruleId, issueId, agentRunId } = seedArchiveHistory();
    const app = await buildApp();

    const archived = await app.inject({
      method: 'DELETE',
      url: `/api/automation/rules/${ruleId}`,
    });
    expect(archived.statusCode).toBe(204);

    const storedAfterArchive = state.db!
      .select()
      .from(automationRules)
      .where(eq(automationRules.id, ruleId))
      .get();
    expect(storedAfterArchive).toMatchObject({ enabled: 0 });
    expect(storedAfterArchive?.archivedAt).toEqual(expect.any(Number));
    const archiveAt = storedAfterArchive!.archivedAt;

    const activeList = await app.inject({ method: 'GET', url: '/api/automation/rules' });
    expect(activeList.statusCode).toBe(200);
    expect((activeList.json() as Array<{ id: string }>).some((row) => row.id === ruleId)).toBe(false);

    const historyRule = await app.inject({
      method: 'GET',
      url: `/api/automation/rules/${ruleId}`,
    });
    expect(historyRule.statusCode).toBe(200);
    expect(historyRule.json()).toMatchObject({
      id: ruleId,
      enabled: false,
      archivedAt: expect.any(String),
    });

    const historyRuns = await app.inject({
      method: 'GET',
      url: `/api/automation/rules/${ruleId}/runs?limit=20`,
    });
    expect(historyRuns.statusCode).toBe(200);
    expect((historyRuns.json() as Array<{ status: string }>).map((run) => run.status)).toEqual(
      expect.arrayContaining(['failed', 'skipped', 'pending_dispatch']),
    );

    // Evidence survives both direct DB and route-level history reads.
    expect(
      state.db!.select().from(automationRuns).where(eq(automationRuns.ruleId, ruleId)).all(),
    ).toHaveLength(3);
    expect(state.db!.select().from(issues).where(eq(issues.id, issueId)).get()?.id).toBe(issueId);
    expect(
      state.db!.select().from(agentRuns).where(eq(agentRuns.id, agentRunId)).get()?.id,
    ).toBe(agentRunId);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/automation/rules/${ruleId}`,
      // Even an otherwise-invalid edit gets the archive lifecycle 409 first.
      payload: {},
    });
    expect(patch.statusCode).toBe(409);

    const runNow = await app.inject({
      method: 'POST',
      url: `/api/automation/rules/${ruleId}/run-now`,
    });
    expect(runNow.statusCode).toBe(409);

    const reconcile = await app.inject({
      method: 'POST',
      url: '/api/automation/runs/auto-archive-pending/reconcile',
    });
    expect(reconcile.statusCode).toBe(409);

    // Repeated archive is idempotent and does not overwrite the original audit time.
    const repeatArchive = await app.inject({
      method: 'DELETE',
      url: `/api/automation/rules/${ruleId}`,
    });
    expect(repeatArchive.statusCode).toBe(204);
    expect(
      state.db!
        .select({ archivedAt: automationRules.archivedAt })
        .from(automationRules)
        .where(eq(automationRules.id, ruleId))
        .get()?.archivedAt,
    ).toBe(archiveAt);

    // No blocked write may produce a new AutomationRun / AgentRun or alter the pending row.
    expect(
      state.db!.select().from(automationRuns).where(eq(automationRuns.ruleId, ruleId)).all(),
    ).toHaveLength(3);
    expect(
      state.db!.select().from(agentRuns).where(eq(agentRuns.id, agentRunId)).get()?.status,
    ).toBe('failed');
    expect(
      state.db!
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.id, 'auto-archive-pending'))
        .get(),
    ).toMatchObject({ status: 'pending_dispatch', linkedRunId: null });

    await app.close();
  });
});

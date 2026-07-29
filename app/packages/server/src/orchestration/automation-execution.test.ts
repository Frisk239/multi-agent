import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, automationRules, automationRuns } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));
const publish = vi.hoisted(() => vi.fn());

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
}));
vi.mock('./event-bus.js', () => ({ eventBus: { publish } }));
vi.mock('./run-worker.js', () => ({ wakeRunWorker: vi.fn() }));
vi.mock('./inbox-writer.js', () => ({
  notifyEnqueueSkipped: vi.fn(),
  notifyRunTerminal: vi.fn(),
}));

import {
  reconcileAutomationRun,
  syncAutomationRunFromAgentRun,
} from './automation-execution.js';

describe('automation execution truth', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    publish.mockReset();
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';

    const now = Date.now();
    t.db.insert(automationRules).values({
      id: 'auto-rule-1',
      name: 'truth',
      enabled: 1,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 5,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: 'agt-test-1',
      titleTemplate: 'truth',
      bodyTemplate: '',
      lastPlannedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();
    t.db.insert(automationRuns).values({
      id: 'auto-run-1',
      ruleId: 'auto-rule-1',
      plannedAt: now,
      source: 'manual',
      status: 'pending_dispatch',
      issueId: 'iss-test-1',
      linkedRunId: null,
      error: 'runtime missing',
      createdAt: now,
      updatedAt: now,
    }).run();
  });

  afterEach(() => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('concurrent reconcile claims the DB row and creates at most one linked run', async () => {
    const results = await Promise.all([
      reconcileAutomationRun('auto-run-1'),
      reconcileAutomationRun('auto-run-1'),
    ]);
    expect(results.filter((result) => result.ok && result.created)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.status === 409)).toHaveLength(1);
    const rows = state.db!.select().from(agentRuns).where(eq(agentRuns.issueId, 'iss-test-1')).all();
    expect(rows).toHaveLength(1);
    const automation = state.db!.select().from(automationRuns).where(eq(automationRuns.id, 'auto-run-1')).get()!;
    expect(automation.status).toBe('issue_created');
    expect(automation.linkedRunId).toBe(rows[0].id);
  });

  it('does not dispatch a non-pending automation run', async () => {
    state.db!.update(automationRuns)
      .set({ status: 'issue_created' })
      .where(eq(automationRuns.id, 'auto-run-1'))
      .run();
    const result = await reconcileAutomationRun('auto-run-1');
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(
      state.db!.select().from(agentRuns).where(eq(agentRuns.issueId, 'iss-test-1')).all(),
    ).toHaveLength(0);
  });

  it('syncs running and terminal exactly once without overwriting terminal', () => {
    const now = Date.now();
    state.db!.insert(agentRuns).values({
      id: 'agent-run-truth',
      issueId: 'iss-test-1',
      agentId: 'agt-test-1',
      runtime: 'opencode',
      kind: 'issue',
      status: 'running',
      createdAt: now,
      startedAt: now,
    }).run();
    let row = state.db!.select().from(agentRuns).where(eq(agentRuns.id, 'agent-run-truth')).get()!;
    syncAutomationRunFromAgentRun(toAgentRun(row));
    expect(state.db!.select().from(automationRuns).where(eq(automationRuns.id, 'auto-run-1')).get()!.status).toBe('running');

    state.db!.update(agentRuns).set({ status: 'failed', error: 'boom', failureReason: 'exec_error' }).where(eq(agentRuns.id, row.id)).run();
    row = state.db!.select().from(agentRuns).where(eq(agentRuns.id, row.id)).get()!;
    syncAutomationRunFromAgentRun(toAgentRun(row));
    syncAutomationRunFromAgentRun({ ...toAgentRun(row), status: 'completed', error: null });
    const automation = state.db!.select().from(automationRuns).where(eq(automationRuns.id, 'auto-run-1')).get()!;
    expect(automation.status).toBe('failed');
    expect(automation.error).toBe('boom');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, automationRules, automationRuns } from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));
const publish = vi.hoisted(() => vi.fn());
const wake = vi.hoisted(() => vi.fn());

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
}));
vi.mock('./event-bus.js', () => ({ eventBus: { publish } }));
vi.mock('./run-worker.js', () => ({ wakeRunWorker: wake }));
vi.mock('./inbox-writer.js', () => ({
  notifyEnqueueSkipped: vi.fn(),
  notifyRunTerminal: vi.fn(),
}));

import {
  buildAutomationRunOnlyPrompt,
  dispatchAutomationRule,
  resolveAutomationExecutionMode,
} from './automation-dispatch.js';
import {
  findOpenAutomationForAgentRun,
  syncAutomationRunFromAgentRun,
} from './automation-execution.js';
import { toAgentRun } from '../db/reshape.js';

describe('automation run_only (A5 / Multica)', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    publish.mockReset();
    wake.mockReset();
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(() => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('resolveAutomationExecutionMode defaults to create_issue', () => {
    expect(resolveAutomationExecutionMode(undefined)).toBe('create_issue');
    expect(resolveAutomationExecutionMode(null)).toBe('create_issue');
    expect(resolveAutomationExecutionMode('create_issue')).toBe('create_issue');
    expect(resolveAutomationExecutionMode('run_only')).toBe('run_only');
    expect(resolveAutomationExecutionMode('weird')).toBe('create_issue');
  });

  it('buildAutomationRunOnlyPrompt joins title/body/footer', () => {
    const prompt = buildAutomationRunOnlyPrompt({
      title: '巡检 T',
      body: 'body here',
      ruleName: 'nightly',
      source: 'manual',
      plannedAt: 1_700_000_000_000,
    });
    expect(prompt).toContain('巡检 T');
    expect(prompt).toContain('body here');
    expect(prompt).toContain('run_only');
    expect(prompt).toContain('nightly');
    expect(prompt).toContain('manual');
  });

  it('dispatchAutomationRule run_only enqueues quick_create without issue', async () => {
    const now = Date.now();
    state.db!.insert(automationRules).values({
      id: 'rule-run-only',
      name: 'patrol',
      enabled: 1,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 15,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: 'agt-test-1',
      titleTemplate: 'patrol {{date}}',
      bodyTemplate: 'check health',
      executionMode: 'run_only',
      lastPlannedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();

    const plannedAt = now - (now % 60_000);
    const auto = await dispatchAutomationRule('rule-run-only', plannedAt, 'manual');

    expect(auto.issueId).toBeNull();
    expect(auto.linkedRunId).toBeTruthy();
    expect(auto.status).toBe('issue_created');

    const linked = state.db!
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, auto.linkedRunId!))
      .get();
    expect(linked).toBeTruthy();
    expect(linked!.issueId).toBeNull();
    expect(linked!.kind).toBe('quick_create');
    expect(linked!.status).toBe('queued');
    expect(linked!.quickPrompt).toContain('check health');
    expect(linked!.quickPrompt).toContain('run_only');
    expect(wake).toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run:queued' }),
    );
  });

  it('syncAutomationRunFromAgentRun follows linkedRunId for run_only', async () => {
    const now = Date.now();
    state.db!.insert(automationRules).values({
      id: 'rule-ro-sync',
      name: 'sync-ro',
      enabled: 1,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 5,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: 'agt-test-1',
      titleTemplate: 't',
      bodyTemplate: '',
      executionMode: 'run_only',
      lastPlannedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();

    const plannedAt = now - 1000;
    const auto = await dispatchAutomationRule('rule-ro-sync', plannedAt, 'schedule');
    const linkedId = auto.linkedRunId!;

    state.db!
      .update(agentRuns)
      .set({ status: 'completed', finishedAt: Date.now() })
      .where(eq(agentRuns.id, linkedId))
      .run();
    const row = state.db!.select().from(agentRuns).where(eq(agentRuns.id, linkedId)).get()!;
    const agentRun = toAgentRun(row);
    expect(agentRun.issueId).toBeNull();

    expect(findOpenAutomationForAgentRun(agentRun)?.id).toBe(auto.id);
    syncAutomationRunFromAgentRun(agentRun);

    const updated = state.db!
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, auto.id))
      .get()!;
    expect(updated.status).toBe('success');
    expect(updated.linkedRunId).toBe(linkedId);
  });

  it('dispatch is idempotent on plannedAt for run_only', async () => {
    const now = Date.now();
    state.db!.insert(automationRules).values({
      id: 'rule-idem',
      name: 'idem',
      enabled: 1,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 15,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: 'agt-test-1',
      titleTemplate: 't',
      bodyTemplate: '',
      executionMode: 'run_only',
      lastPlannedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();
    const plannedAt = 1_700_000_100_000;
    const a = await dispatchAutomationRule('rule-idem', plannedAt, 'manual');
    const b = await dispatchAutomationRule('rule-idem', plannedAt, 'schedule');
    expect(b.id).toBe(a.id);
    expect(b.linkedRunId).toBe(a.linkedRunId);
    const count = state.db!
      .select()
      .from(agentRuns)
      .all()
      .filter((r) => r.kind === 'quick_create' && r.quickPrompt?.includes('run_only')).length;
    // only one agent run for this plannedAt (idempotent)
    expect(count).toBe(1);
  });
});

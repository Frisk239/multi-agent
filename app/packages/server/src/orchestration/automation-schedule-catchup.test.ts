import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, automationRules, automationRuns, issues } from '../db/schema.js';

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
  resolveAssigneeLabel: (type: string | null, id: string | null) => (id ? `${type}:${id}` : null),
  resolveAuthorLabel: (type: string, id: string) => `${type}:${id}`,
}));
vi.mock('./event-bus.js', () => ({ eventBus: { publish } }));
vi.mock('./run-worker.js', () => ({ wakeRunWorker: wake }));
vi.mock('./inbox-writer.js', () => ({
  ensureIssueSubscriber: vi.fn(),
  notifyAssigned: vi.fn(),
  notifyEnqueueSkipped: vi.fn(),
  notifyRunTerminal: vi.fn(),
}));

import {
  planLatestScheduleSlot,
  SCHEDULE_CATCHUP_SKIPPED_ERROR,
} from './automation-dispatch.js';
import { tickAutomationWorker } from './automation-worker.js';

const BASE_NOW = Date.UTC(2026, 7, 19, 10, 10, 0);

function localTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function localSlot(ms: number, hours: number, minutes: number): number {
  const d = new Date(ms);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

function seedRule(
  id: string,
  overrides: Partial<typeof automationRules.$inferInsert> = {},
): void {
  const createdAt = overrides.createdAt ?? BASE_NOW - 2 * 60 * 60_000;
  state.db!.insert(automationRules).values({
    id,
    name: `catchup ${id}`,
    enabled: 1,
    scheduleKind: 'interval_minutes',
    intervalMinutes: 15,
    dailyTime: null,
    cronExpression: null,
    assigneeType: 'agent',
    assigneeId: 'agt-test-1',
    titleTemplate: `catchup ${id}`,
    bodyTemplate: '',
    executionMode: 'run_only',
    lastPlannedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }).run();
}

function scheduleRuns(ruleId: string) {
  return state.db!
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.ruleId, ruleId), eq(automationRuns.source, 'schedule')))
    .all();
}

describe('automation schedule catch-up planner', () => {
  it('returns only the latest interval slot strictly after the schedule anchor', () => {
    const now = Date.UTC(2026, 7, 19, 10, 14, 0);
    const anchor = Date.UTC(2026, 7, 19, 9, 1, 0);
    expect(
      planLatestScheduleSlot(
        { scheduleKind: 'interval_minutes', intervalMinutes: 5, dailyTime: null, cronExpression: null },
        anchor,
        now,
      ),
    ).toBe(Date.UTC(2026, 7, 19, 10, 10, 0));
  });

  it('uses canonical daily and cron slots, including a cron slot exactly at now', () => {
    const now = Date.UTC(2026, 7, 19, 10, 0, 0);
    const anchor = Date.UTC(2026, 7, 19, 9, 40, 0);
    expect(
      planLatestScheduleSlot(
        { scheduleKind: 'cron', intervalMinutes: null, dailyTime: null, cronExpression: '*/5 * * * *' },
        anchor,
        now,
      ),
    ).toBe(now);

    const dailyNow = localSlot(now, 10, 15);
    const dailyAnchor = dailyNow - 24 * 60 * 60_000;
    expect(
      planLatestScheduleSlot(
        { scheduleKind: 'daily_at', intervalMinutes: null, dailyTime: '10:00', cronExpression: null },
        dailyAnchor,
        dailyNow,
      ),
    ).toBe(localSlot(dailyNow, 10, 0));
  });

  it('respects the 24-hour lower bound and never plans at or before its anchor', () => {
    const now = Date.UTC(2026, 7, 19, 10, 10, 0);
    const monthly = {
      scheduleKind: 'cron' as const,
      intervalMinutes: null,
      dailyTime: null,
      cronExpression: '0 0 1 * *',
    };
    expect(planLatestScheduleSlot(monthly, now - 90 * 24 * 60 * 60_000, now)).toBeNull();
    expect(
      planLatestScheduleSlot(
        { scheduleKind: 'interval_minutes', intervalMinutes: 15, dailyTime: null, cronExpression: null },
        Date.UTC(2026, 7, 19, 10, 0, 0),
        now,
      ),
    ).toBeNull();
  });
});

describe('automation schedule catch-up worker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_NOW);
    const testDb = createTestDb();
    state.db = testDb.db;
    state.cleanup = testDb.cleanup;
    seedTestFixtures(testDb.db);
    publish.mockReset();
    wake.mockReset();
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(() => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    vi.useRealTimers();
  });

  it('does not schedule an archived rule even if a stale enabled snapshot exists', async () => {
    const ruleId = 'rule-archived-worker-snapshot';
    seedRule(ruleId, {
      // DELETE writes both fields atomically. Keeping enabled=1 here models a
      // stale worker candidate and proves archivedAt is an independent gate.
      enabled: 1,
      archivedAt: BASE_NOW - 1,
      executionMode: 'create_issue',
    });

    await tickAutomationWorker(BASE_NOW);

    expect(scheduleRuns(ruleId)).toHaveLength(0);
    expect(
      state.db!.select().from(issues).where(eq(issues.originRuleId, ruleId)).all(),
    ).toHaveLength(0);
    expect(state.db!.select().from(agentRuns).all()).toHaveLength(0);
  });

  it('writes one late schedule skipped audit with zero side effects, then dispatches the next slot', async () => {
    const ruleId = 'rule-late-interval';
    const staleSlot = Date.UTC(2026, 7, 19, 10, 0, 0);
    seedRule(ruleId);

    await tickAutomationWorker(BASE_NOW);
    await tickAutomationWorker(BASE_NOW); // repeat tick / process restart sees the same DB claim

    let runs = scheduleRuns(ruleId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      plannedAt: staleSlot,
      status: 'skipped',
      issueId: null,
      linkedRunId: null,
      error: SCHEDULE_CATCHUP_SKIPPED_ERROR,
    });
    expect(
      state.db!.select().from(issues).where(eq(issues.originRuleId, ruleId)).all(),
    ).toHaveLength(0);
    expect(state.db!.select().from(agentRuns).all()).toHaveLength(0);

    const next = Date.UTC(2026, 7, 19, 10, 15, 0);
    vi.setSystemTime(next);
    await tickAutomationWorker(next);
    runs = scheduleRuns(ruleId).sort((a, b) => a.plannedAt - b.plannedAt);
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({
      plannedAt: next,
      status: 'issue_created',
      source: 'schedule',
    });
    expect(runs[1]?.linkedRunId).toBeTruthy();
    expect(state.db!.select().from(agentRuns).all()).toHaveLength(1);
  });

  it('uses late canonical interval, daily, and cron slots without replaying prior plans', async () => {
    const dailySlot = new Date(BASE_NOW - 10 * 60_000);
    dailySlot.setSeconds(0, 0);
    const cronSlot = Date.UTC(2026, 7, 19, 10, 0, 0);
    seedRule('rule-late-daily', {
      scheduleKind: 'daily_at',
      intervalMinutes: null,
      dailyTime: localTime(dailySlot.getTime()),
      createdAt: dailySlot.getTime() - 2 * 24 * 60 * 60_000,
      updatedAt: dailySlot.getTime() - 2 * 24 * 60 * 60_000,
    });
    seedRule('rule-late-cron', {
      scheduleKind: 'cron',
      intervalMinutes: null,
      dailyTime: null,
      cronExpression: '0 * * * *',
    });

    await tickAutomationWorker(BASE_NOW);

    expect(scheduleRuns('rule-late-daily')).toMatchObject([
      { plannedAt: dailySlot.getTime(), status: 'skipped', error: SCHEDULE_CATCHUP_SKIPPED_ERROR },
    ]);
    expect(scheduleRuns('rule-late-cron')).toMatchObject([
      { plannedAt: cronSlot, status: 'skipped', error: SCHEDULE_CATCHUP_SKIPPED_ERROR },
    ]);
    expect(state.db!.select().from(agentRuns).all()).toHaveLength(0);
  });

  it('dispatches the latest daily and cron slots that are still inside the five-minute grace', async () => {
    const dailySlot = BASE_NOW - 2 * 60_000;
    const cronSlot = BASE_NOW;
    seedRule('rule-fresh-daily', {
      scheduleKind: 'daily_at',
      intervalMinutes: null,
      dailyTime: localTime(dailySlot),
      createdAt: dailySlot - 2 * 24 * 60 * 60_000,
      updatedAt: dailySlot - 2 * 24 * 60 * 60_000,
    });
    seedRule('rule-fresh-cron', {
      scheduleKind: 'cron',
      intervalMinutes: null,
      dailyTime: null,
      cronExpression: '*/5 * * * *',
    });

    await tickAutomationWorker(BASE_NOW);

    expect(scheduleRuns('rule-fresh-daily')).toMatchObject([
      { plannedAt: dailySlot, status: 'issue_created', source: 'schedule' },
    ]);
    expect(scheduleRuns('rule-fresh-cron')).toMatchObject([
      { plannedAt: cronSlot, status: 'issue_created', source: 'schedule' },
    ]);
    expect(state.db!.select().from(agentRuns).all()).toHaveLength(2);
  });

  it('ignores manual runs as a schedule anchor and does not roll lastPlannedAt backward', async () => {
    const ruleId = 'rule-manual-does-not-anchor';
    const manualAt = BASE_NOW;
    const staleScheduleSlot = Date.UTC(2026, 7, 19, 10, 0, 0);
    seedRule(ruleId, { lastPlannedAt: manualAt });
    state.db!.insert(automationRuns).values({
      id: 'manual-does-not-anchor',
      ruleId,
      plannedAt: manualAt,
      source: 'manual',
      status: 'issue_created',
      issueId: null,
      linkedRunId: null,
      error: null,
      createdAt: manualAt,
      updatedAt: manualAt,
    }).run();

    await tickAutomationWorker(BASE_NOW);

    expect(scheduleRuns(ruleId)).toMatchObject([
      { plannedAt: staleScheduleSlot, status: 'skipped', error: SCHEDULE_CATCHUP_SKIPPED_ERROR },
    ]);
    const rule = state.db!.select().from(automationRules).where(eq(automationRules.id, ruleId)).get()!;
    expect(rule.lastPlannedAt).toBe(manualAt);
  });

  it('re-preflights an anchored stale schedule dispatching placeholder into failed', async () => {
    const now = Date.UTC(2026, 7, 19, 10, 1, 10);
    const plannedAt = Date.UTC(2026, 7, 19, 10, 0, 0);
    vi.setSystemTime(now);
    seedRule('rule-stale-placeholder', {
      intervalMinutes: 5,
      createdAt: plannedAt - 60 * 60_000,
      updatedAt: plannedAt - 60 * 60_000,
    });
    state.db!.insert(automationRuns).values({
      id: 'stale-schedule-dispatching',
      ruleId: 'rule-stale-placeholder',
      plannedAt,
      source: 'schedule',
      status: 'dispatching',
      issueId: null,
      linkedRunId: null,
      error: null,
      createdAt: now - 70_000,
      updatedAt: now - 70_000,
    }).run();

    await tickAutomationWorker(now);

    const runs = scheduleRuns('rule-stale-placeholder');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: 'stale-schedule-dispatching',
      plannedAt,
      status: 'failed',
    });
    expect(runs[0]?.error).toMatch(/派发中断/);
  });

  it('keeps a fresh schedule dispatching placeholder waiting instead of planning a second slot', async () => {
    const now = Date.UTC(2026, 7, 19, 10, 6, 0);
    const plannedAt = Date.UTC(2026, 7, 19, 10, 5, 0);
    vi.setSystemTime(now);
    seedRule('rule-fresh-placeholder', {
      intervalMinutes: 5,
      createdAt: plannedAt - 60 * 60_000,
      updatedAt: plannedAt - 60 * 60_000,
    });
    state.db!.insert(automationRuns).values({
      id: 'fresh-schedule-dispatching',
      ruleId: 'rule-fresh-placeholder',
      plannedAt,
      source: 'schedule',
      status: 'dispatching',
      issueId: null,
      linkedRunId: null,
      error: null,
      createdAt: now - 30_000,
      updatedAt: now - 30_000,
    }).run();

    await tickAutomationWorker(now);

    expect(scheduleRuns('rule-fresh-placeholder')).toMatchObject([
      { id: 'fresh-schedule-dispatching', plannedAt, status: 'dispatching' },
    ]);
    expect(scheduleRuns('rule-fresh-placeholder')).toHaveLength(1);
  });
});

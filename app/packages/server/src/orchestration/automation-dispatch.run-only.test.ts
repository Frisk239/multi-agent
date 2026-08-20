import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, automationRules, automationRuns, issues } from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));
const publish = vi.hoisted(() => vi.fn());
const wake = vi.hoisted(() => vi.fn());
// G2-2：mock readiness，可控「离线」语义
const readiness = vi.hoisted(() => ({
  result: null as null | { status: string; detail: string | null },
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
  // reshape.toIssue 需要的 label 装配（测试不校验 label 文案，给个可读值即可）
  resolveAssigneeLabel: (t: string | null, id: string | null) =>
    id ? `${t}:${id}` : null,
  resolveAuthorLabel: (t: string | null, id: string | null) =>
    id ? `${t}:${id}` : null,
}));
vi.mock('./event-bus.js', () => ({ eventBus: { publish } }));
vi.mock('./run-worker.js', () => ({ wakeRunWorker: wake }));
vi.mock('./inbox-writer.js', () => ({
  notifyEnqueueSkipped: vi.fn(),
  notifyRunTerminal: vi.fn(),
  ensureIssueSubscriber: vi.fn(),
  notifyAssigned: vi.fn(),
}));
vi.mock('./readiness.js', () => ({
  computeAgentReadiness: async () => readiness.result,
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
    readiness.result = { status: 'ready', detail: null };
  });

  afterEach(() => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    readiness.result = null;
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
    // G2-4：WS 发布统一 toObservedAgentRun 投影——run:queued 事件必须带可观测字段
    const published = publish.mock.calls[0][0] as { type: string; run: Record<string, unknown> };
    expect(published.type).toBe('run:queued');
    expect(published.run.queueAgeMs).toBeTypeOf('number');
    expect(published.run.queueEligibleAt).toBeNull();
    expect(published.run.queueBlockedReason).toBeNull();
    expect(published.run.heartbeatAgeMs).toBeNull();
    expect(published.run.terminalReason).toBeNull();
  });

  it.each([
    ['schedule', 'create_issue'],
    ['manual', 'run_only'],
  ] as const)(
    'archived rule rejects %s dispatch before it can create Issue or AgentRun (%s)',
    async (source, executionMode) => {
      const now = Date.now();
      const ruleId = `rule-archived-${source}`;
      state.db!.insert(automationRules).values({
        id: ruleId,
        name: `archived ${source}`,
        enabled: 0,
        archivedAt: now,
        scheduleKind: 'interval_minutes',
        intervalMinutes: 15,
        dailyTime: null,
        cronExpression: null,
        assigneeType: 'agent',
        assigneeId: 'agt-test-1',
        titleTemplate: 'must not dispatch',
        bodyTemplate: '',
        executionMode,
        lastPlannedAt: null,
        createdAt: now - 1,
        updatedAt: now,
      }).run();

      const runsBefore = state.db!.select().from(automationRuns).all().length;
      const issuesBefore = state.db!.select().from(issues).all().length;
      const agentRunsBefore = state.db!.select().from(agentRuns).all().length;

      await expect(
        dispatchAutomationRule(ruleId, now - 60_000, source),
      ).rejects.toThrow('automation rule 已归档');

      // Archive is a lifecycle boundary, not a deletion: it creates no new
      // audit placeholder, Issue, or queued CLI run for either entry point.
      expect(state.db!.select().from(automationRuns).all()).toHaveLength(runsBefore);
      expect(state.db!.select().from(issues).all()).toHaveLength(issuesBefore);
      expect(state.db!.select().from(agentRuns).all()).toHaveLength(agentRunsBefore);
      expect(wake).not.toHaveBeenCalled();
    },
  );

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

  it('G6-2 concurrent dispatch for run_only: overlapping ticks enqueue exactly one agent run', async () => {
    const now = Date.now();
    state.db!.insert(automationRules).values({
      id: 'rule-idem-conc',
      name: 'idem-conc',
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
    const plannedAt = 1_700_000_100_001;
    const [a, b] = await Promise.all([
      dispatchAutomationRule('rule-idem-conc', plannedAt, 'schedule'),
      dispatchAutomationRule('rule-idem-conc', plannedAt, 'manual'),
    ]);
    expect(b.id).toBe(a.id);
    expect(a.status).toBe('issue_created');
    const count = state.db!
      .select()
      .from(agentRuns)
      .all()
      .filter((r) => r.kind === 'quick_create' && r.quickPrompt?.includes('run_only')).length;
    expect(count).toBe(1);
    const autoRows = state.db!
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.ruleId, 'rule-idem-conc'))
      .all();
    expect(autoRows).toHaveLength(1);
    expect(autoRows[0]!.linkedRunId).not.toBeNull();
  });

  it.each(['runtime_missing', 'cwd_missing', 'error'] as const)(
    'G2-2 run_only + agent 离线（%s）→ skipped（非 failed），不落死任务',
    async (status) => {
      delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
      readiness.result = { status, detail: `detail-${status}` };
      const now = Date.now();
      state.db!.insert(automationRules).values({
        id: `rule-ro-offline-${status}`,
        name: 'offline-ro',
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
      const auto = await dispatchAutomationRule(
        `rule-ro-offline-${status}`,
        plannedAt,
        'schedule',
      );

      expect(auto.status).toBe('skipped');
      expect(auto.issueId).toBeNull();
      expect(auto.linkedRunId).toBeNull();
      expect(auto.error).toContain('agent 离线');
      expect(auto.error).toContain(`detail-${status}`);
      // 没有 enqueue、没有 wake：瞬态离线不堆积死任务
      expect(wake).not.toHaveBeenCalled();
      const quickRuns = state.db!
        .select()
        .from(agentRuns)
        .all()
        .filter((r) => r.kind === 'quick_create');
      expect(quickRuns.length).toBe(0);
    },
  );

  it('G2-2 run_only + readiness 竞态（agent 不存在）→ skipped', async () => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    readiness.result = null; // readiness 返回 null = agent 不存在
    const now = Date.now();
    state.db!.insert(automationRules).values({
      id: 'rule-ro-race',
      name: 'race-ro',
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

    const plannedAt = now - (now % 60_000);
    const auto = await dispatchAutomationRule('rule-ro-race', plannedAt, 'schedule');
    expect(auto.status).toBe('skipped');
    expect(auto.error).toContain('agent 不存在');
  });

  it('G2-2 create_issue + agent 离线 → 仍建卡（持久审计），run 记 pending_dispatch', async () => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    readiness.result = { status: 'runtime_missing', detail: 'runtime opencode 未安装或不在 PATH' };
    const now = Date.now();
    state.db!.insert(automationRules).values({
      id: 'rule-ci-offline',
      name: 'offline-ci',
      enabled: 1,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 15,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: 'agt-test-1',
      titleTemplate: '巡检 {{date}}',
      bodyTemplate: 'body',
      executionMode: 'create_issue',
      lastPlannedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();

    const plannedAt = now - (now % 60_000);
    const auto = await dispatchAutomationRule('rule-ci-offline', plannedAt, 'schedule');

    // issue 持久审计：即使 agent 离线也建卡
    expect(auto.issueId).toBeTruthy();
    expect(auto.status).toBe('pending_dispatch');
    expect(auto.error).toContain('Issue 已建');
    const issue = state.db!
      .select()
      .from(issues)
      .where(eq(issues.id, auto.issueId!))
      .get();
    expect(issue).toBeTruthy();
    expect(issue!.title).toContain('巡检');
  });
});

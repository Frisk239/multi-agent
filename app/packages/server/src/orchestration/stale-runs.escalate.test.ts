/**
 * G6-4：escalateFailedSquadRuns 原子化直测（原零覆盖）+ deferred 查重真实 DB 回归。
 * 真实迁移 DB + 真函数（inbox/event mock 仅边界）。
 * 覆盖：未标记才打标 / 条件 UPDATE 幂等（二次调用零处理零通知）/ leader·非 squad·running 不碰 /
 *       已标记不重复通知 / deferred N+1 去重回归。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, activityLogs, issues } from '../db/schema.js';
import { escalateFailedSquadRuns, escalateDeferredUnclaimedRuns } from './stale-runs.js';

const mocks = vi.hoisted(() => ({
  notifySquadEscalated: vi.fn(),
  notifyDeferredUnclaimed: vi.fn(),
  notifyRunTerminal: vi.fn(),
  publish: vi.fn(),
  abortRun: vi.fn(),
  hasRunAbort: vi.fn(),
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
  resolveAssigneeLabel: () => 'test-assignee',
  resolveAuthorLabel: (type: string, id: string) =>
    type === 'member' && id === 'system' ? '系统' : id,
}));

vi.mock('./inbox-writer.js', () => ({
  notifySquadEscalated: (...args: unknown[]) => mocks.notifySquadEscalated(...args),
  notifyDeferredUnclaimed: (...args: unknown[]) => mocks.notifyDeferredUnclaimed(...args),
  notifyRunTerminal: (...args: unknown[]) => mocks.notifyRunTerminal(...args),
}));

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: (...args: unknown[]) => mocks.publish(...args) },
}));

vi.mock('./run-control.js', () => ({
  abortRun: (...args: unknown[]) => mocks.abortRun(...args),
  hasRunAbort: (runId?: string) => mocks.hasRunAbort(runId),
}));

vi.mock('./inbox-prefs.js', () => ({
  readInboxPrefs: () => ({
    notifyIssueSuccess: false,
    notifyTypes: {},
    notifySeverities: {},
    deferredAutoEscalate: false,
  }),
}));

function insertSquadRun(id: string, overrides: Partial<typeof agentRuns.$inferInsert> = {}): void {
  testState.db!.insert(agentRuns)
    .values({
      id,
      issueId: 'iss-test-1',
      agentId: 'agt-test-2',
      runtime: 'opencode',
      status: 'failed',
      kind: 'issue',
      isLeader: 0,
      squadId: 'sqd-test-1',
      failureReason: 'exec_error',
      error: 'boom',
      startedAt: Date.now() - 5_000,
      finishedAt: Date.now() - 1_000,
      createdAt: Date.now() - 10_000,
      ...overrides,
    })
    .run();
}

describe('G6-4 escalateFailedSquadRuns 原子化', () => {
  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    mocks.notifySquadEscalated.mockReset();
    mocks.notifyDeferredUnclaimed.mockReset();
    mocks.publish.mockReset();
  });

  afterEach(() => {
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
  });

  it('只处理未标记 squad member run：error 前缀 + failureReason + activity + 通知', () => {
    insertSquadRun('run-es-1');
    insertSquadRun('run-es-2', {
      error: '[Squad Escalated] original_reason: timeout; old', // 已标记 → 不碰
    });

    const n = escalateFailedSquadRuns(Date.now());
    expect(n).toBe(1);
    expect(mocks.notifySquadEscalated).toHaveBeenCalledTimes(1);

    const row1 = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, 'run-es-1')).get()!;
    expect(row1.error).toContain('[Squad Escalated] original_reason: exec_error');
    expect(row1.error).toContain('boom');
    const row2 = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, 'run-es-2')).get()!;
    expect(row2.error).toBe('[Squad Escalated] original_reason: timeout; old'); // 未改写

    const acts = testState.db!
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.eventType, 'squad_escalated'))
      .all();
    expect(acts).toHaveLength(1);
    expect(JSON.parse(acts[0]!.payload!)).toMatchObject({ runId: 'run-es-1' });
  });

  it('幂等：二次调用零处理零通知（条件 UPDATE 未标记谓词挡住）', () => {
    insertSquadRun('run-es-idem');
    expect(escalateFailedSquadRuns(Date.now())).toBe(1);
    mocks.notifySquadEscalated.mockReset();
    expect(escalateFailedSquadRuns(Date.now())).toBe(0);
    expect(mocks.notifySquadEscalated).not.toHaveBeenCalled();
  });

  it('leader / 非 squad / running 不处理', () => {
    insertSquadRun('run-es-leader', { isLeader: 1 });
    insertSquadRun('run-es-nosquad', { squadId: null });
    insertSquadRun('run-es-running', { status: 'running', startedAt: Date.now() - 1_000, finishedAt: null });
    const n = escalateFailedSquadRuns(Date.now());
    expect(n).toBe(0);
    expect(mocks.notifySquadEscalated).not.toHaveBeenCalled();
  });

  it('G6-4 deferred 查重（真实 DB 回归）：已有 run_deferred activity 的 queued run 不重复升级', () => {
    process.env.MA_DEFERRED_UNCLAIMED_MS = '1000';
    // 预先插好 run_deferred activity（模拟已升级过）
    testState.db!.insert(activityLogs)
      .values({
        id: 'act-deferred-1',
        issueId: 'iss-test-1',
        actorType: 'system',
        actorName: '系统',
        eventType: 'run_deferred',
        payload: JSON.stringify({ runId: 'run-defer-1', agentId: 'agt-test-1' }),
        createdAt: Date.now(),
      })
      .run();
    testState.db!.insert(agentRuns)
      .values({
        id: 'run-defer-1',
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'queued',
        kind: 'issue',
        createdAt: Date.now() - 60_000,
      })
      .run();
    const n = escalateDeferredUnclaimedRuns(Date.now());
    expect(n).toBe(0);
    expect(mocks.notifyDeferredUnclaimed).not.toHaveBeenCalled();
    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, 'run-defer-1')).get()!;
    expect(row.status).toBe('queued'); // 未被转 deferred
    delete process.env.MA_DEFERRED_UNCLAIMED_MS;
  });
});

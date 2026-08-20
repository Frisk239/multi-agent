import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { agentRuns, agents, inboxItems, issues, workspaces } from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
  publish: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
  resolveAssigneeLabel: () => 'test',
  resolveAuthorLabel: () => 'test',
}));

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: (...args: unknown[]) => state.publish(...args) },
}));

import {
  isConnectionFailure,
  scheduleAutoRetryForFailedRun,
  transitionAndScheduleAutoRetry,
} from './auto-retry.js';

function setup(originType: string | null = null) {
  const t = createTestDb();
  state.db = t.db;
  state.cleanup = t.cleanup;
  const now = Date.now();
  t.db.insert(workspaces).values({ id: 'ws-retry', name: 'retry', createdAt: now }).run();
  t.db
    .insert(agents)
    .values({
      id: 'agent-retry',
      name: 'retry agent',
      runtime: 'opencode',
      concurrency: 1,
      instructions: '',
      createdAt: now,
    })
    .run();
  t.db
    .insert(issues)
    .values({
      id: originType ? 'issue-auto' : 'issue-retry',
      workspaceId: 'ws-retry',
      identifier: originType ? 'AUTO-1' : 'RETRY-1',
      title: 'retry',
      status: 'in_progress',
      priority: 'none',
      assigneeType: 'agent',
      assigneeId: 'agent-retry',
      creatorType: 'member',
      creatorId: 'member-local',
      position: 0,
      originType,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { db: t.db, now, issueId: originType ? 'issue-auto' : 'issue-retry' };
}

function insertRun(
  db: ReturnType<typeof createTestDb>['db'],
  args: {
    id: string;
    issueId: string;
    status: 'running' | 'failed' | 'timed_out';
    failureReason?: string | null;
    attempt?: number;
    maxAttempts?: number;
    priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  },
) {
  db.insert(agentRuns)
    .values({
      id: args.id,
      issueId: args.issueId,
      agentId: 'agent-retry',
      runtime: 'opencode',
      status: args.status,
      kind: 'issue',
      priority: args.priority ?? 'none',
      failureReason: args.failureReason ?? null,
      error: args.failureReason ?? null,
      attempt: args.attempt ?? 1,
      maxAttempts: args.maxAttempts ?? 2,
      isLeader: 0,
      squadId: null,
      createdAt: Date.now(),
    })
    .run();
  return db.select().from(agentRuns).where(eq(agentRuns.id, args.id)).get()!;
}

describe('bounded infrastructure auto-retry', () => {
  beforeEach(() => state.publish.mockReset());
  afterEach(() => {
    state.cleanup?.();
    state.cleanup = null;
    state.db = null;
  });

  it('creates one immediate child atomically and is idempotent', () => {
    const { db, now, issueId } = setup();
    const parent = insertRun(db, {
      id: 'run-atomic',
      issueId,
      status: 'running',
      priority: 'urgent', // G6-1：重试 child 应继承父 run 优先级快照
    });
    const first = transitionAndScheduleAutoRetry({
      id: parent.id,
      fromStatuses: ['running'],
      patch: {
        status: 'failed',
        finishedAt: now,
        error: 'timeout',
        failureReason: 'timeout',
      },
      now,
    });
    expect(first.applied).toBe(true);
    expect(first.autoRetryChild?.attempt).toBe(2);
    expect(first.autoRetryChild?.nextAttemptAt).toBeNull();
    expect(db.select().from(agentRuns).all().filter((r) => r.autoRetryOfRunId === parent.id)).toHaveLength(1);
    // G6-1：child.priority === parent.priority（不因重试掉队）
    const child = db.select().from(agentRuns).where(eq(agentRuns.autoRetryOfRunId, parent.id)).get()!;
    expect(child.priority).toBe('urgent');

    const second = transitionAndScheduleAutoRetry({
      id: parent.id,
      fromStatuses: ['running'],
      patch: { status: 'failed', failureReason: 'timeout' },
      now: now + 1,
    });
    expect(second.applied).toBe(false);
    expect(db.select().from(agentRuns).all().filter((r) => r.autoRetryOfRunId === parent.id)).toHaveLength(1);
  });

  it('uses provider-network third-attempt budget and bounded backoff', () => {
    const { db, now, issueId } = setup();
    const parent = insertRun(db, {
      id: 'run-provider-2',
      issueId,
      status: 'failed',
      failureReason: 'provider_network',
      attempt: 2,
      maxAttempts: 2,
    });
    const child = scheduleAutoRetryForFailedRun(parent, now);
    expect(child?.attempt).toBe(3);
    expect(child?.maxAttempts).toBe(3);
    expect(child?.nextAttemptAt).toBe(new Date(now + 1_000).toISOString());

    const exhausted = insertRun(db, {
      id: 'run-provider-3',
      issueId,
      status: 'failed',
      failureReason: 'provider_network',
      attempt: 3,
      maxAttempts: 3,
    });
    expect(scheduleAutoRetryForFailedRun(exhausted, now)).toBeNull();
  });

  it('allows automation-linked Issues but excludes non-allowlisted reasons', () => {
    const automation = setup('automation');
    const autoRun = insertRun(automation.db, {
      id: 'run-automation',
      issueId: automation.issueId,
      status: 'failed',
      failureReason: 'timeout',
    });
    expect(scheduleAutoRetryForFailedRun(autoRun, automation.now)?.attempt).toBe(2);

    automation.db
      .insert(issues)
      .values({
        id: 'issue-normal',
        workspaceId: 'ws-retry',
        identifier: 'RETRY-2',
        title: 'normal',
        status: 'in_progress',
        priority: 'none',
        assigneeType: 'agent',
        assigneeId: 'agent-retry',
        creatorType: 'member',
        creatorId: 'member-local',
        position: 0,
        originType: null,
        createdAt: automation.now,
        updatedAt: automation.now,
      })
      .run();
    const ordinaryRun = insertRun(automation.db, {
      id: 'run-auth',
      issueId: 'issue-normal',
      status: 'failed',
      failureReason: 'auth_required',
    });
    expect(scheduleAutoRetryForFailedRun(ordinaryRun, automation.now)).toBeNull();
  });

  it('does not direct-insert an auto-retry child after its source Agent is archived', () => {
    const { db, now, issueId } = setup();
    db.update(agents)
      .set({ archivedAt: now })
      .where(eq(agents.id, 'agent-retry'))
      .run();
    const source = insertRun(db, {
      id: 'run-archived-retry-source',
      issueId,
      status: 'failed',
      failureReason: 'timeout',
    });

    expect(scheduleAutoRetryForFailedRun(source, now)).toBeNull();
    expect(
      db.select().from(agentRuns).all().filter((row) => row.autoRetryOfRunId === source.id),
    ).toHaveLength(0);
  });
});

// —— P2-4：显式 fallback 自动改派（runtime 连接不上 + 预算用尽）——

function setupEscalation(opts?: {
  fallbackAgentId?: string | null;
  fallbackArchived?: boolean;
}) {
  const t = createTestDb();
  state.db = t.db;
  state.cleanup = t.cleanup;
  const now = Date.now();
  t.db.insert(workspaces).values({ id: 'ws-esc', name: 'esc', createdAt: now }).run();
  t.db
    .insert(agents)
    .values({
      id: 'agent-esc',
      name: '主岗',
      runtime: 'opencode',
      concurrency: 1,
      instructions: '',
      fallbackAgentId:
        opts?.fallbackAgentId === undefined ? 'agent-fallback' : opts.fallbackAgentId,
      createdAt: now,
    })
    .run();
  t.db
    .insert(agents)
    .values({
      id: 'agent-fallback',
      name: '后备',
      runtime: 'claude-code',
      concurrency: 1,
      instructions: '',
      archivedAt: opts?.fallbackArchived ? now : null,
      createdAt: now,
    })
    .run();
  t.db
    .insert(issues)
    .values({
      id: 'issue-esc',
      workspaceId: 'ws-esc',
      identifier: 'ESC-1',
      title: 'esc',
      status: 'in_progress',
      priority: 'none',
      assigneeType: 'agent',
      assigneeId: 'agent-esc',
      creatorType: 'member',
      creatorId: 'member-local',
      position: 0,
      originType: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { db: t.db, now, issueId: 'issue-esc' };
}

function insertEscRun(
  db: ReturnType<typeof createTestDb>['db'],
  args: {
    id: string;
    issueId: string;
    status: 'running' | 'failed' | 'timed_out';
    failureReason?: string | null;
    attempt?: number;
    maxAttempts?: number;
    agentId?: string;
    escalatedFromRunId?: string | null;
    error?: string | null;
  },
) {
  db.insert(agentRuns)
    .values({
      id: args.id,
      issueId: args.issueId,
      agentId: args.agentId ?? 'agent-esc',
      runtime: 'opencode',
      status: args.status,
      kind: 'issue',
      failureReason: args.failureReason ?? null,
      error: args.error ?? args.failureReason ?? null,
      attempt: args.attempt ?? 1,
      maxAttempts: args.maxAttempts ?? 2,
      isLeader: 0,
      squadId: null,
      escalatedFromRunId: args.escalatedFromRunId ?? null,
      createdAt: Date.now(),
    })
    .run();
  return db.select().from(agentRuns).where(eq(agentRuns.id, args.id)).get()!;
}

describe('P2-4 explicit fallback escalation (runtime_offline + budget exhausted)', () => {
  beforeEach(() => state.publish.mockReset());
  afterEach(() => {
    state.cleanup?.();
    state.cleanup = null;
    state.db = null;
  });

  it('① 预算用尽 + runtime_offline + 有 fallback → 生成改派子 run（换 agent/runtime、追溯、原 run 注明）', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-1',
      issueId,
      status: 'running',
      failureReason: 'runtime_offline',
      error: 'runtime is offline',
      attempt: 2,
      maxAttempts: 2,
    });
    const tr = transitionAndScheduleAutoRetry({
      id: parent.id,
      fromStatuses: ['running'],
      patch: {
        status: 'failed',
        finishedAt: now,
        error: 'runtime is offline',
        failureReason: 'runtime_offline',
      },
      now,
    });

    expect(tr.applied).toBe(true);
    expect(tr.autoRetryChild).toBeNull();
    expect(tr.escalatedChild).not.toBeNull();
    const child = tr.escalatedChild!;
    expect(child.agentId).toBe('agent-fallback'); // agent 换掉
    expect(child.runtime).toBe('claude-code'); // runtime 换掉（fallback 的）
    expect(child.status).toBe('queued');
    expect(child.kind).toBe('issue');
    expect(child.issueId).toBe(issueId);
    expect(child.escalatedFromRunId).toBe(parent.id); // 追溯
    expect(child.attempt).toBe(1); // 新 agent 重新计
    expect(child.maxAttempts).toBe(2);

    // 原 run：error 注明 + 终态
    const parentRow = db.select().from(agentRuns).where(eq(agentRuns.id, parent.id)).get()!;
    expect(parentRow.status).toBe('failed');
    expect(parentRow.error).toContain('[已自动改派给 后备]');

    // 只生成一个改派子 run
    const escChildren = db
      .select()
      .from(agentRuns)
      .all()
      .filter((r) => r.escalatedFromRunId === parent.id);
    expect(escChildren).toHaveLength(1);

    // 可见性：run:queued + activity run_escalated + inbox
    const queuedEvents = state.publish.mock.calls.filter((c) => c[0].type === 'run:queued');
    expect(queuedEvents.some((c) => c[0].run.id === child.id)).toBe(true);
    const actEvent = state.publish.mock.calls.find((c) => c[0].type === 'activity:created');
    expect(actEvent).toBeTruthy();
    expect(actEvent![0].activity.eventType).toBe('run_escalated');
    expect(actEvent![0].activity.payload).toMatchObject({
      fromRunId: parent.id,
      toRunId: child.id,
      fromAgentId: 'agent-esc',
      toAgentId: 'agent-fallback',
      toAgentName: '后备',
    });
    const inboxRow = db
      .select()
      .from(inboxItems)
      .all()
      .find((r) => r.dedupeKey === `escalate_fallback:${parent.id}`);
    expect(inboxRow).toBeTruthy();
    expect(inboxRow?.title).toContain('已自动转给 后备');
  });

  it('② 无 fallbackAgentId → 行为不变（无改派子 run）', () => {
    const { db, now, issueId } = setupEscalation({ fallbackAgentId: null });
    const parent = insertEscRun(db, {
      id: 'run-esc-2',
      issueId,
      status: 'failed',
      failureReason: 'runtime_offline',
      attempt: 2,
      maxAttempts: 2,
    });
    expect(scheduleAutoRetryForFailedRun(parent, now)).toBeNull();
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(0);
  });

  it('③ fallback 已归档 → 不改派', () => {
    const { db, now, issueId } = setupEscalation({ fallbackArchived: true });
    const parent = insertEscRun(db, {
      id: 'run-esc-3',
      issueId,
      status: 'failed',
      failureReason: 'runtime_offline',
      attempt: 2,
      maxAttempts: 2,
    });
    expect(scheduleAutoRetryForFailedRun(parent, now)).toBeNull();
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(0);
  });

  it('④ 非 runtime_offline（timeout）→ 不改派', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-4',
      issueId,
      status: 'failed',
      failureReason: 'timeout',
      attempt: 2,
      maxAttempts: 2,
    });
    expect(scheduleAutoRetryForFailedRun(parent, now)).toBeNull();
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(0);
    // 无任何 run_escalated activity
    expect(state.publish.mock.calls.some((c) => c[0]?.type === 'activity:created')).toBe(false);
  });

  it('⑤ 深度 1：escalated_from_run_id 非空的 run 不再改派（fallback 失败不递归）', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-5',
      issueId,
      status: 'failed',
      failureReason: 'runtime_offline',
      attempt: 2,
      maxAttempts: 2,
      escalatedFromRunId: 'run-esc-0',
    });
    expect(scheduleAutoRetryForFailedRun(parent, now)).toBeNull();
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(0);
  });

  it('⑥ attempt 未用尽 → 走 auto-retry，不改派（回归）', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-6',
      issueId,
      status: 'failed',
      failureReason: 'runtime_offline',
      attempt: 1,
      maxAttempts: 2,
    });
    const child = scheduleAutoRetryForFailedRun(parent, now);
    expect(child?.attempt).toBe(2); // retry 子 run
    expect(child?.escalatedFromRunId).toBeNull();
    expect(child?.agentId).toBe('agent-esc'); // 仍是原 agent
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(0);
  });

  it('幂等：同一 failed run 重复触发只生成一个改派子 run', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-7',
      issueId,
      status: 'running',
      failureReason: 'runtime_offline',
      attempt: 2,
      maxAttempts: 2,
    });
    const first = transitionAndScheduleAutoRetry({
      id: parent.id,
      fromStatuses: ['running'],
      patch: {
        status: 'failed',
        finishedAt: now,
        error: 'runtime is offline',
        failureReason: 'runtime_offline',
      },
      now,
    });
    expect(first.escalatedChild).not.toBeNull();
    // 二次调用：状态已 failed，update 0-change → 不改派、不重复
    const second = transitionAndScheduleAutoRetry({
      id: parent.id,
      fromStatuses: ['running'],
      patch: { status: 'failed', failureReason: 'runtime_offline' },
      now: now + 1,
    });
    expect(second.applied).toBe(false);
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(1);
  });
});

// —— P2-4 触发面修正：连接不上类 exec_error（CLI 未安装 / spawn ENOENT）——

describe('P2-4 escalation trigger: connection-failure exec_error escalates on first failure', () => {
  beforeEach(() => state.publish.mockReset());
  afterEach(() => {
    state.cleanup?.();
    state.cleanup = null;
    state.db = null;
  });

  it('① CLI 未安装文本（opencode CLI 未安装）+ attempt=1 → 首次失败即改派（换 agent/runtime + 注明）', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-conn-1',
      issueId,
      status: 'running',
      failureReason: 'exec_error',
      error: 'opencode CLI 未安装',
      attempt: 1,
      maxAttempts: 2,
    });
    const tr = transitionAndScheduleAutoRetry({
      id: parent.id,
      fromStatuses: ['running'],
      patch: {
        status: 'failed',
        finishedAt: now,
        error: 'opencode CLI 未安装',
        failureReason: 'exec_error',
      },
      now,
    });

    expect(tr.applied).toBe(true);
    expect(tr.autoRetryChild).toBeNull(); // exec_error 不进 auto-retry
    expect(tr.escalatedChild).not.toBeNull();
    const child = tr.escalatedChild!;
    expect(child.agentId).toBe('agent-fallback'); // agent 换掉
    expect(child.runtime).toBe('claude-code'); // runtime 换掉（fallback 的）
    expect(child.status).toBe('queued');
    expect(child.escalatedFromRunId).toBe(parent.id); // 追溯
    expect(child.attempt).toBe(1); // 新 agent 重新计

    // 原 run：error 注明「已自动改派给」且保留原始错误
    const parentRow = db.select().from(agentRuns).where(eq(agentRuns.id, parent.id)).get()!;
    expect(parentRow.status).toBe('failed');
    expect(parentRow.error).toContain('opencode CLI 未安装');
    expect(parentRow.error).toContain('[已自动改派给 后备]');

    // 只生成一个改派子 run，且无 auto-retry 子 run
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(1);
    expect(
      db.select().from(agentRuns).all().filter((r) => r.autoRetryOfRunId === parent.id),
    ).toHaveLength(0);

    // 可见性：activity run_escalated + inbox
    const actEvent = state.publish.mock.calls.find((c) => c[0]?.type === 'activity:created');
    expect(actEvent).toBeTruthy();
    expect(actEvent![0].activity.eventType).toBe('run_escalated');
    expect(actEvent![0].activity.payload).toMatchObject({
      fromRunId: parent.id,
      toRunId: child.id,
      toAgentId: 'agent-fallback',
    });
    const inboxRow = db
      .select()
      .from(inboxItems)
      .all()
      .find((r) => r.dedupeKey === `escalate_fallback:${parent.id}`);
    expect(inboxRow).toBeTruthy();
  });

  it('② spawn ENOENT 文本（Error: spawn opencode ENOENT）+ attempt=1 → 改派', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-conn-2',
      issueId,
      status: 'failed',
      failureReason: 'exec_error',
      error: 'Error: spawn opencode ENOENT',
      attempt: 1,
      maxAttempts: 2,
    });
    const child = scheduleAutoRetryForFailedRun(parent, now);
    expect(child).not.toBeNull();
    expect(child!.agentId).toBe('agent-fallback');
    expect(child!.escalatedFromRunId).toBe(parent.id);
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(1);
    const parentRow = db.select().from(agentRuns).where(eq(agentRuns.id, parent.id)).get()!;
    expect(parentRow.error).toContain('[已自动改派给 后备]');
  });

  it('③ exit 1（CLI 跑了但报错）+ 有 fallback → 不改派（防误伤回归）', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-conn-3',
      issueId,
      status: 'failed',
      failureReason: 'exec_error',
      error: 'exit 1',
      attempt: 1,
      maxAttempts: 2,
    });
    expect(scheduleAutoRetryForFailedRun(parent, now)).toBeNull();
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(0);
    // 无任何 run_escalated activity
    expect(state.publish.mock.calls.some((c) => c[0]?.type === 'activity:created')).toBe(false);
  });

  it('④ timeout 类仍不改派（回归；非连接不上）', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-conn-4',
      issueId,
      status: 'failed',
      failureReason: 'timeout',
      error: 'timeout: CLI exceeded 60000ms without finishing',
      attempt: 2,
      maxAttempts: 2,
    });
    expect(scheduleAutoRetryForFailedRun(parent, now)).toBeNull();
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(0);
  });

  it('⑤ runtime_offline 预算未用尽（attempt=1 < max=2）→ 走 auto-retry 不改派（回归）', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-conn-5',
      issueId,
      status: 'failed',
      failureReason: 'runtime_offline',
      error: 'runtime is offline',
      attempt: 1,
      maxAttempts: 2,
    });
    const child = scheduleAutoRetryForFailedRun(parent, now);
    expect(child?.attempt).toBe(2); // retry 子 run
    expect(child?.escalatedFromRunId).toBeNull();
    expect(child?.agentId).toBe('agent-esc'); // 仍是原 agent
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(0);
  });

  it('幂等：exec_error 连接不上类重复触发只生成一个改派子 run', () => {
    const { db, now, issueId } = setupEscalation();
    const parent = insertEscRun(db, {
      id: 'run-esc-conn-6',
      issueId,
      status: 'failed',
      failureReason: 'exec_error',
      error: 'opencode CLI 未安装',
      attempt: 1,
      maxAttempts: 2,
    });
    const first = scheduleAutoRetryForFailedRun(parent, now);
    expect(first).not.toBeNull();
    const second = scheduleAutoRetryForFailedRun(parent, now + 1);
    expect(second).toBeNull();
    expect(
      db.select().from(agentRuns).all().filter((r) => r.escalatedFromRunId === parent.id),
    ).toHaveLength(1);
  });
});

describe('isConnectionFailure predicate', () => {
  it('runtime_offline → true（不看 error 文本）', () => {
    expect(isConnectionFailure('runtime_offline', null)).toBe(true);
    expect(isConnectionFailure('runtime_offline', 'runtime is offline')).toBe(true);
  });

  it('exec_error + CLI 未安装文本 → true', () => {
    expect(isConnectionFailure('exec_error', 'opencode CLI 未安装')).toBe(true);
    expect(isConnectionFailure('exec_error', 'claude-code CLI 未安装')).toBe(true);
    expect(isConnectionFailure('exec_error', 'cursor-agent 未安装')).toBe(true);
  });

  it('exec_error + spawn ENOENT → true（大小写不敏感）', () => {
    expect(isConnectionFailure('exec_error', 'Error: spawn opencode ENOENT')).toBe(true);
    expect(isConnectionFailure('exec_error', 'Error: spawn opencode enoent')).toBe(true);
    expect(isConnectionFailure('exec_error', 'Error: spawn cursor-agent ENOENT')).toBe(true);
  });

  it('exit 1 / timeout / 普通报错 / 无 error → false（非连接不上）', () => {
    expect(isConnectionFailure('exec_error', 'exit 1')).toBe(false);
    expect(
      isConnectionFailure('exec_error', 'timeout: CLI exceeded 60000ms without finishing'),
    ).toBe(false);
    expect(isConnectionFailure('exec_error', 'some random error')).toBe(false);
    expect(isConnectionFailure('exec_error', null)).toBe(false);
    expect(isConnectionFailure('exec_error', '')).toBe(false);
    expect(isConnectionFailure(null, null)).toBe(false);
  });

  it('timeout / stale_heartbeat / provider_network reason → false（走 auto-retry）', () => {
    expect(isConnectionFailure('timeout', 'timeout')).toBe(false);
    expect(isConnectionFailure('stale_heartbeat', 'stale: heartbeat missing')).toBe(false);
    expect(isConnectionFailure('provider_network', 'ECONNRESET')).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { agentRuns, agents, issues, workspaces } from '../db/schema.js';

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

  it('excludes automation-linked Issues and non-allowlisted reasons', () => {
    const automation = setup('automation');
    const autoRun = insertRun(automation.db, {
      id: 'run-automation',
      issueId: automation.issueId,
      status: 'failed',
      failureReason: 'timeout',
    });
    expect(scheduleAutoRetryForFailedRun(autoRun, automation.now)).toBeNull();

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
});

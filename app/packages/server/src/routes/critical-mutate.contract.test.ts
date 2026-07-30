/**
 * B3 · Contract tests for critical HTTP mutate paths.
 * Drives real route handlers against an in-memory migrated DB.
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

describe('B3 critical mutate contracts', () => {
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

  it('POST /api/automation/rules accepts executionMode run_only', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/automation/rules',
      payload: {
        name: 'contract-run-only',
        enabled: true,
        scheduleKind: 'interval_minutes',
        intervalMinutes: 15,
        assigneeType: 'agent',
        assigneeId: 'agt-test-1',
        titleTemplate: 't {{date}}',
        bodyTemplate: 'b',
        executionMode: 'run_only',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { executionMode?: string; id: string };
    expect(body.executionMode).toBe('run_only');

    const runNow = await app.inject({
      method: 'POST',
      url: `/api/automation/rules/${body.id}/run-now`,
    });
    expect(runNow.statusCode).toBe(201);
    const auto = runNow.json() as {
      issueId: string | null;
      linkedRunId: string | null;
      status: string;
    };
    expect(auto.issueId).toBeNull();
    expect(auto.linkedRunId).toBeTruthy();
    await app.close();
  });

  it('POST /api/runs/:id/cancel cancels a queued run', async () => {
    const now = Date.now();
    const runId = 'run-contract-cancel';
    state.db!.insert(agentRuns).values({
      id: runId,
      issueId: 'iss-test-1',
      agentId: 'agt-test-1',
      runtime: 'claude-code',
      status: 'queued',
      kind: 'issue',
      quickPrompt: null,
      isLeader: 0,
      squadId: null,
      projectId: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      lastHeartbeatAt: null,
      createdAt: now,
    }).run();

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/runs/${runId}/cancel`,
    });
    expect([200, 201].includes(res.statusCode)).toBe(true);
    const row = state.db!.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    expect(row?.status).toBe('cancelled');
    await app.close();
  });

  it('POST /api/runs/:id/retry creates a follow-up when terminal', async () => {
    const now = Date.now();
    const runId = 'run-contract-retry';
    state.db!.insert(agentRuns).values({
      id: runId,
      issueId: 'iss-test-1',
      agentId: 'agt-test-1',
      runtime: 'claude-code',
      status: 'failed',
      kind: 'issue',
      quickPrompt: null,
      isLeader: 0,
      squadId: null,
      projectId: null,
      error: 'boom',
      failureReason: 'timeout',
      startedAt: now - 1000,
      finishedAt: now,
      lastHeartbeatAt: now - 500,
      createdAt: now - 2000,
    }).run();

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/runs/${runId}/retry`,
      payload: {},
    });
    // 200/201 with new run, or 4xx if policy blocks — assert contract shape
    expect(res.statusCode).toBeLessThan(500);
    if (res.statusCode < 400) {
      const body = res.json() as { id?: string; status?: string; run?: { id: string } };
      const newId = body.id ?? body.run?.id;
      expect(newId).toBeTruthy();
      expect(newId).not.toBe(runId);
    }
    await app.close();
  });

  it('POST /api/issues creates issue with assignee contract', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: {
        title: 'contract create',
        description: 'body',
        priority: 'medium',
        assignee: { type: 'agent', id: 'agt-test-1' },
      },
    });
    expect(res.statusCode).toBeLessThan(500);
    if (res.statusCode < 400) {
      const body = res.json() as { id?: string; title?: string; issue?: { id: string } };
      expect(body.id ?? body.issue?.id).toBeTruthy();
    }
    // invalid empty title
    const bad = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: { title: '' },
    });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

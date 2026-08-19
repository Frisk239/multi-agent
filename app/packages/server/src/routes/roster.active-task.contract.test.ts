import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AgentSummary } from '@ma/shared';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, agents, issues } from '../db/schema.js';

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
    transaction: (fn: () => void) => () => fn(),
  },
  getSqliteHardeningInfo: () => ({
    path: ':memory:', busyTimeoutMs: 5_000, journalMode: 'memory', foreignKeys: true,
  }),
  resolveAssigneeLabel: () => 'Test Agent',
  resolveAuthorLabel: () => 'Test User',
}));

import { rosterRoutes } from './roster.js';

describe('GET /api/agents active Issue task projection', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const testDb = createTestDb();
    state.db = testDb.db;
    state.cleanup = testDb.cleanup;
    const fixtures = seedTestFixtures(testDb.db);

    testDb.db.insert(agents).values({
      id: 'agt-peek-failed',
      name: 'Failed Agent',
      runtime: 'opencode',
      concurrency: 1,
      createdAt: 1_000,
    }).run();

    testDb.db.insert(issues).values([
      {
        id: 'iss-peek-old',
        workspaceId: fixtures.workspaceId,
        identifier: 'FRI-811',
        title: '较早的 Issue 工作',
        status: 'todo',
        priority: 'medium',
        assigneeType: 'agent',
        assigneeId: 'agt-test-1',
        creatorType: 'member',
        creatorId: fixtures.userId,
        position: 10,
        createdAt: 1_000,
        updatedAt: 1_000,
      },
      {
        id: 'iss-peek-new',
        workspaceId: fixtures.workspaceId,
        identifier: 'FRI-812',
        title: '最新的 Issue 工作',
        status: 'in_progress',
        priority: 'high',
        assigneeType: 'agent',
        assigneeId: 'agt-test-1',
        creatorType: 'member',
        creatorId: fixtures.userId,
        position: 11,
        createdAt: 2_000,
        updatedAt: 2_000,
      },
    ]).run();

    // agt-test-1 has three active runs. The newer chat must not displace the
    // newest Issue projection, while its presence keeps the row multi-active.
    // agt-test-2 has two non-Issue runs and therefore must not receive a fake title.
    testDb.db.insert(agentRuns).values([
      {
        id: 'run-peek-issue-old', issueId: 'iss-peek-old', agentId: 'agt-test-1',
        runtime: 'opencode', status: 'queued', kind: 'issue', createdAt: 3_000,
      },
      {
        id: 'run-peek-issue-new', issueId: 'iss-peek-new', agentId: 'agt-test-1',
        runtime: 'opencode', status: 'running', kind: 'issue', createdAt: 4_000,
      },
      {
        id: 'run-peek-chat-newer', agentId: 'agt-test-1', runtime: 'opencode',
        status: 'running', kind: 'chat', createdAt: 5_000,
      },
      {
        id: 'run-peek-chat-only', agentId: 'agt-test-2', runtime: 'claude-code',
        status: 'waiting_local_directory', kind: 'chat', createdAt: 6_000,
      },
      {
        id: 'run-peek-quick-only', agentId: 'agt-test-2', runtime: 'claude-code',
        status: 'queued', kind: 'quick_create', createdAt: 7_000,
      },
      {
        id: 'run-peek-failed', agentId: 'agt-peek-failed', runtime: 'opencode',
        status: 'failed', kind: 'quick_create', createdAt: 8_000,
      },
    ]).run();

    app = Fastify({ logger: false });
    await app.register(rosterRoutes);
  });

  afterEach(async () => {
    await app.close();
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('projects the latest active Issue in bulk, preserves live state/count, and omits chat/quick titles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    expect(res.statusCode).toBe(200);
    const roster = AgentSummary.array().parse(res.json());

    const issueWorker = roster.find((agent) => agent.id === 'agt-test-1');
    expect(issueWorker).toMatchObject({
      liveStatus: 'working',
      activeRunCount: 3,
      currentIssueRun: {
        runId: 'run-peek-issue-new',
        runStatus: 'running',
        issueId: 'iss-peek-new',
        issueIdentifier: 'FRI-812',
        issueTitle: '最新的 Issue 工作',
      },
    });

    const nonIssueWorker = roster.find((agent) => agent.id === 'agt-test-2');
    expect(nonIssueWorker).toMatchObject({
      liveStatus: 'blocked',
      activeRunCount: 2,
      currentIssueRun: null,
    });

    const failedWorker = roster.find((agent) => agent.id === 'agt-peek-failed');
    expect(failedWorker).toMatchObject({
      liveStatus: 'failed',
      activeRunCount: 0,
      currentIssueRun: null,
    });
  });
});

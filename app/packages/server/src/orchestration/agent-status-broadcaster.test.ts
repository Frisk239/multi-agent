import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { agentRuns } from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
}));

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: vi.fn() },
}));

import { computeAgentLiveStatus } from './agent-status-broadcaster.js';

describe('computeAgentLiveStatus', () => {
  beforeEach(() => {
    const testDb = createTestDb();
    state.db = testDb.db;
    state.cleanup = testDb.cleanup;
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('uses only active rows for a live agent and keeps the newest active run deterministic', () => {
    state.db!.insert(agentRuns).values([
      {
        id: 'run-terminal-failed', agentId: 'agent-live', runtime: 'opencode',
        status: 'failed', kind: 'quick_create', createdAt: 1_000,
      },
      {
        id: 'run-running', agentId: 'agent-live', runtime: 'opencode',
        status: 'running', kind: 'quick_create', createdAt: 2_000,
      },
      {
        id: 'run-newest-active', agentId: 'agent-live', runtime: 'opencode',
        status: 'queued', kind: 'quick_create', createdAt: 3_000,
      },
    ]).run();

    expect(computeAgentLiveStatus('agent-live')).toEqual({
      status: 'working',
      activeRunCount: 2,
      latestRunId: 'run-newest-active',
    });
  });

  it('falls back to the latest terminal run only when no run is active', () => {
    state.db!.insert(agentRuns).values({
      id: 'run-latest-failed', agentId: 'agent-failed', runtime: 'opencode',
      status: 'failed', kind: 'quick_create', createdAt: 4_000,
    }).run();

    expect(computeAgentLiveStatus('agent-failed')).toEqual({
      status: 'failed',
      activeRunCount: 0,
      latestRunId: null,
    });
  });
});

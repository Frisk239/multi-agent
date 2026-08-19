import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const agents = { table: 'agents' };
  const agentRuns = { table: 'agentRuns' };
  const projects = { table: 'projects' };
  return {
    agents,
    agentRuns,
    projects,
    agent: { id: 'agt-preflight', runtime: 'pi' },
    computeAgentReadiness: vi.fn(),
    wakeRunWorker: vi.fn(),
  };
});

vi.mock('../db/schema.js', () => ({
  agents: mocks.agents,
  agentRuns: mocks.agentRuns,
  projects: mocks.projects,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          get: () => (table === mocks.agents ? mocks.agent : null),
        }),
      }),
    }),
    insert: () => {
      throw new Error('quick run must not insert after a failed preflight');
    },
  },
}));

vi.mock('../db/reshape.js', () => ({ toObservedAgentRun: vi.fn() }));
vi.mock('../db/squad-loader.js', () => ({ loadSquadDetail: vi.fn() }));
vi.mock('../orchestration/event-bus.js', () => ({ eventBus: { publish: vi.fn() } }));
vi.mock('../orchestration/readiness.js', () => ({
  computeAgentReadiness: (...args: unknown[]) => mocks.computeAgentReadiness(...args),
}));
vi.mock('../orchestration/run-worker.js', () => ({
  wakeRunWorker: (...args: unknown[]) => mocks.wakeRunWorker(...args),
}));

import { quickRunRoutes } from './quick-runs.js';

describe('quick run preflight dispatch gate', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    mocks.computeAgentReadiness.mockReset();
    mocks.wakeRunWorker.mockReset();
    mocks.computeAgentReadiness.mockResolvedValue({
      agentId: 'agt-preflight',
      runtime: 'pi',
      runtimeInstalled: true,
      runtimePath: '/bin/pi',
      runtimeVersion: '1.0.0',
      concurrency: 1,
      runningCount: 0,
      slotsAvailable: 1,
      cwdConfigured: true,
      preflightStatus: 'failed',
      runtimeVerification: 'unverified',
      status: 'error',
      detail: '运行时安全预检未通过：请先在本机 CLI 完成登录，然后重试。',
    });
    app = Fastify();
    await quickRunRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('明确安全预检失败时拒绝 quick run，且不创建 queued run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/quick-runs',
      payload: {
        prompt: 'verify explicit preflight gate',
        assignee: { type: 'agent', id: 'agt-preflight' },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      code: 'readiness_failed',
      reason: 'readiness_error',
      enqueue: { status: 'skipped', reason: 'readiness_error' },
    });
    expect(mocks.wakeRunWorker).not.toHaveBeenCalled();
  });
});

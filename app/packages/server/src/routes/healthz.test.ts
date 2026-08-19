import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/client.js', () => ({
  sqlite: {
    prepare: () => ({
      get: () => ({ '1': 1 }),
    }),
  },
}));

import { healthzRoutes } from './healthz.js';
import {
  __resetProcessHealthForTests,
  markWorkerStarted,
  noteWorkerFailure,
  noteWorkerTick,
} from '../process-health.js';

type Handler = (req?: unknown, reply?: unknown) => Promise<unknown> | unknown;

function makeApp() {
  const routes: Record<string, Handler> = {};
  const app = {
    get: (path: string, handler: Handler) => {
      routes[`GET ${path}`] = handler;
    },
  };
  return { app: app as never, routes };
}

describe('GET /healthz', () => {
  beforeEach(() => {
    __resetProcessHealthForTests();
  });

  it('returns process health JSON shape', async () => {
    const { app, routes } = makeApp();
    await healthzRoutes(app);
    const handler = routes['GET /healthz'];
    expect(handler).toBeTypeOf('function');

    const now = Date.now();
    for (const key of [
      'runWorker',
      'automationWorker',
      'wikiIngestWorker',
      'staleRunSweeper',
    ] as const) {
      markWorkerStarted(key, now);
      noteWorkerTick(key, now);
    }

    const body = (await handler({})) as {
      status: string;
      ts: number;
      uptimeMs: number;
      db: { ok: boolean; latencyMs: number | null };
      workers: Record<string, {
        lastTickAt: number | null;
        ageMs: number | null;
        running: boolean;
        consecutiveFailures: number;
        lastFailureAt: number | null;
        lastFailureSummary: string | null;
      }>;
    };

    expect(body.status === 'ok' || body.status === 'degraded').toBe(true);
    expect(typeof body.ts).toBe('number');
    expect(typeof body.uptimeMs).toBe('number');
    expect(body.db.ok).toBe(true);
    expect(body.workers.runWorker).toMatchObject({
      running: true,
      lastTickAt: expect.any(Number),
    });
    expect(body.workers.automationWorker).toBeDefined();
    expect(body.workers.wikiIngestWorker).toBeDefined();
    expect(body.workers.staleRunSweeper).toBeDefined();
  });

  it('projects worker failure metadata without leaking the full error into a synthetic shape', async () => {
    const { app, routes } = makeApp();
    await healthzRoutes(app);
    const handler = routes['GET /healthz']!;

    const now = Date.now();
    for (const key of [
      'runWorker',
      'automationWorker',
      'wikiIngestWorker',
      'staleRunSweeper',
    ] as const) {
      markWorkerStarted(key, now);
      noteWorkerTick(key, now);
    }
    noteWorkerFailure('runWorker', 'sqlite busy token=healthz-test-secret', now + 1);

    const body = (await handler({})) as {
      status: string;
      workers: Record<string, {
        consecutiveFailures: number;
        lastFailureAt: number | null;
        lastFailureSummary: string | null;
      }>;
    };
    expect(body.status).toBe('degraded');
    expect(body.workers.runWorker).toMatchObject({
      consecutiveFailures: 1,
      lastFailureAt: now + 1,
    });
    expect(body.workers.runWorker.lastFailureSummary).not.toContain('healthz-test-secret');
  });
});

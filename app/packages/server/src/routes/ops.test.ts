import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/client.js', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    all: () => [],
    get: () => undefined,
  };
  return {
    db: { select: () => chain },
    sqlite: {
      prepare: () => ({ get: () => ({ '1': 1 }) }),
    },
    getSqliteHardeningInfo: () => ({
      path: './dev.db',
      busyTimeoutMs: 5000,
      journalMode: 'wal',
      foreignKeys: true,
    }),
  };
});

vi.mock('../memory/manager.js', () => ({
  memoryManager: {
    getStatus: () => ({
      provider: 'sqlite-text',
      available: true,
      backend: 'sqlite',
      perProject: false,
      note: 'test',
      breakerOpen: false,
      breakerFailures: 0,
      breakerOpenUntil: null,
    }),
  },
}));

import { opsRoutes } from './ops.js';
import {
  __resetProcessHealthForTests,
  markWorkerStarted,
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

describe('GET /api/ops/snapshot', () => {
  beforeEach(() => {
    __resetProcessHealthForTests();
  });

  it('returns ops snapshot JSON with required fields', async () => {
    const { app, routes } = makeApp();
    await opsRoutes(app);
    const handler = routes['GET /api/ops/snapshot'];
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

    const body = (await handler({})) as Record<string, any>;
    expect(body.ts).toEqual(expect.any(Number));
    expect(body.runs?.active).toBeDefined();
    expect(body.runs?.queueAge).toBeDefined();
    expect(body.wiki?.dead).toEqual(expect.any(Number));
    expect(body.wiki?.pending).toEqual(expect.any(Number));
    expect(body.memory?.breakerOpen).toEqual(expect.any(Boolean));
    expect(body.workers?.runWorker).toBeDefined();
    expect(body.automation).toHaveProperty('lastError');
    expect(body.process?.db?.ok).toBe(true);
    expect(body.sqlite).toMatchObject({
      busyTimeoutMs: 5000,
      journalMode: 'wal',
      foreignKeys: true,
    });
  });
});

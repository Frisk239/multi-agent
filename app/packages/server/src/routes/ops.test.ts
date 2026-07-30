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
      backup: vi.fn(async () => ({ totalPages: 1, remainingPages: 0 })),
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

const backupMocks = vi.hoisted(() => ({
  createDbBackup: vi.fn(),
  listDbBackups: vi.fn(),
}));

vi.mock('../ops-backup.js', () => ({
  createDbBackup: backupMocks.createDbBackup,
  listDbBackups: backupMocks.listDbBackups,
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
    post: (path: string, handler: Handler) => {
      routes[`POST ${path}`] = handler;
    },
    delete: (path: string, handler: Handler) => {
      routes[`DELETE ${path}`] = handler;
    },
  };
  return { app: app as never, routes };
}

function makeReply() {
  const state: { statusCode?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      state.statusCode = code;
      return {
        send(body: unknown) {
          state.body = body;
          return body;
        },
      };
    },
    send(body: unknown) {
      state.body = body;
      return body;
    },
  };
  return { reply, state };
}

describe('GET /api/ops/snapshot', () => {
  beforeEach(() => {
    __resetProcessHealthForTests();
    backupMocks.createDbBackup.mockReset();
    backupMocks.listDbBackups.mockReset();
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
    // Slice 69
    expect(body.resumeStats).toMatchObject({
      sessionPoisoned: expect.any(Number),
      resumeMiss: expect.any(Number),
      deferredUnclaimed: expect.any(Number),
      window: '7d',
    });
  });
});

describe('POST /api/ops/backup & GET /api/ops/backups', () => {
  beforeEach(() => {
    backupMocks.createDbBackup.mockReset();
    backupMocks.listDbBackups.mockReset();
  });

  it('POST backup success → success:true + path/sizeBytes/createdAt', async () => {
    backupMocks.createDbBackup.mockResolvedValue({
      success: true,
      path: 'D:/tmp/ma-backup-x.db',
      name: 'ma-backup-x.db',
      sizeBytes: 4096,
      createdAt: '2026-07-27T00:00:00.000Z',
      dir: 'D:/tmp',
    });

    const { app, routes } = makeApp();
    await opsRoutes(app);
    const handler = routes['POST /api/ops/backup'];
    expect(handler).toBeTypeOf('function');

    const body = (await handler({}, makeReply().reply)) as Record<string, any>;
    expect(body).toMatchObject({
      success: true,
      path: 'D:/tmp/ma-backup-x.db',
      sizeBytes: 4096,
      createdAt: '2026-07-27T00:00:00.000Z',
    });
  });

  it('POST backup failure → status + code', async () => {
    backupMocks.createDbBackup.mockResolvedValue({
      success: false,
      error: '备份目录不可写',
      code: 'BACKUP_DIR_NOT_WRITABLE',
      status: 503,
    });

    const { app, routes } = makeApp();
    await opsRoutes(app);
    const { reply, state } = makeReply();
    const body = (await routes['POST /api/ops/backup']!({}, reply)) as Record<
      string,
      any
    >;
    expect(state.statusCode).toBe(503);
    expect(body ?? state.body).toMatchObject({
      success: false,
      code: 'BACKUP_DIR_NOT_WRITABLE',
    });
  });

  it('GET backups lists entries', async () => {
    backupMocks.listDbBackups.mockReturnValue({
      success: true,
      dir: 'D:/tmp/.ma-backups',
      backups: [
        {
          name: 'ma-backup-a.db',
          path: 'D:/tmp/.ma-backups/ma-backup-a.db',
          size: 100,
          mtime: '2026-07-27T00:00:00.000Z',
        },
      ],
    });

    const { app, routes } = makeApp();
    await opsRoutes(app);
    const body = (await routes['GET /api/ops/backups']!({})) as Record<
      string,
      any
    >;
    expect(body.success).toBe(true);
    expect(body.backups).toHaveLength(1);
    expect(body.backups[0].name).toBe('ma-backup-a.db');
  });
});

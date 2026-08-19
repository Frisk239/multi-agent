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

const secretSafetyMocks = vi.hoisted(() => ({
  scanSecretSafety: vi.fn(),
  cleanLegacySecretLiterals: vi.fn(),
}));

vi.mock('../ops-backup.js', () => ({
  createDbBackup: backupMocks.createDbBackup,
  listDbBackups: backupMocks.listDbBackups,
}));

vi.mock('../secret-safety.js', () => ({
  scanSecretSafety: secretSafetyMocks.scanSecretSafety,
  cleanLegacySecretLiterals: secretSafetyMocks.cleanLegacySecretLiterals,
  SECRET_SAFETY_CONFIRMATION: 'CLEAN_LEGACY_SECRET_LITERALS',
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
    secretSafetyMocks.scanSecretSafety.mockReset();
    secretSafetyMocks.cleanLegacySecretLiterals.mockReset();
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
      secretSafety: {
        status: 'no_known_legacy_literals',
        remediation: 'test advisory',
      },
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
      secretSafety: { status: 'no_known_legacy_literals' },
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

describe('G8-3 secret safety ops routes', () => {
  beforeEach(() => {
    secretSafetyMocks.scanSecretSafety.mockReset();
    secretSafetyMocks.cleanLegacySecretLiterals.mockReset();
  });

  it('scan returns only the service-safe summary envelope', async () => {
    secretSafetyMocks.scanSecretSafety.mockReturnValue({
      status: 'known_legacy_literals_detected',
      remediation: 'clean first',
      findings: [
        {
          agentId: 'agent-1',
          field: 'envVars',
          path: 'envVars[0].value',
          key: 'API_TOKEN',
          length: 24,
          fingerprint: '0123456789ab',
        },
      ],
    });
    const { app, routes } = makeApp();
    await opsRoutes(app);
    const body = await routes['POST /api/ops/secret-safety/scan']!({});
    expect(body).toEqual({
      success: true,
      summary: expect.objectContaining({
        status: 'known_legacy_literals_detected',
        findings: [expect.objectContaining({ fingerprint: '0123456789ab' })],
      }),
    });
  });

  it('apply requires an explicit confirmation phrase', async () => {
    const { app, routes } = makeApp();
    await opsRoutes(app);
    const { reply, state } = makeReply();
    const body = await routes['POST /api/ops/secret-safety/apply']!({ body: {} }, reply);
    expect(state.statusCode).toBe(400);
    expect(body ?? state.body).toMatchObject({
      success: false,
      code: 'SECRET_SAFETY_CONFIRMATION_REQUIRED',
    });
    expect(secretSafetyMocks.cleanLegacySecretLiterals).not.toHaveBeenCalled();
  });

  it('apply permits an inconclusive malformed scan and returns pre/post advisories', async () => {
    secretSafetyMocks.cleanLegacySecretLiterals.mockReturnValue({
      summary: {
        status: 'scan_inconclusive',
        remediation: 'malformed config cleared',
        findings: [
          {
            agentId: 'agent-1',
            field: 'mcpServers',
            path: '$',
            key: '<malformed-json>',
            length: 7,
            fingerprint: 'abcdef012345',
          },
        ],
      },
      updatedAgents: 1,
      after: { status: 'no_known_legacy_literals', remediation: 'post-clean' },
    });
    const { app, routes } = makeApp();
    await opsRoutes(app);
    const body = await routes['POST /api/ops/secret-safety/apply']!(
      { body: { confirmation: 'CLEAN_LEGACY_SECRET_LITERALS' } },
      makeReply().reply,
    );
    expect(body).toMatchObject({
      success: true,
      applied: true,
      updatedAgents: 1,
      summary: { status: 'scan_inconclusive' },
      after: { status: 'no_known_legacy_literals' },
    });
  });
});

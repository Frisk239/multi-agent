// Slice 51：运维快照 API（排障 JSON，非 Prometheus）
// Slice 58：DB backup / list
import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/client.js';
import { getLastShutdownSnapshot } from '../orchestration/graceful-shutdown.js';
import { buildOpsSnapshot } from '../ops-snapshot.js';
import { createDbBackup, listDbBackups } from '../ops-backup.js';
import {
  createSnapshot,
  dryRunRestore,
  listSnapshots,
  removeSnapshotStage,
  stageSnapshotRestore,
  validateSnapshotByName,
} from '../ops-recovery.js';
import { buildProcessHealth, type DbPingResult } from '../process-health.js';
import {
  confirmSafeRestore,
  previewSafeRestore,
  readRestoreJournal,
} from '../safe-live-restore.js';

function pingSqlite(): DbPingResult {
  const t0 = Date.now();
  try {
    sqlite.prepare('SELECT 1').get();
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ops/snapshot', async () => {
    const now = Date.now();
    const last = getLastShutdownSnapshot();
    const processHealth = buildProcessHealth({
      now,
      db: pingSqlite(),
      treeKilled: last?.treeKilled,
    });
    return buildOpsSnapshot({ now, processHealth });
  });

  /** POST /api/ops/backup — better-sqlite3 .backup() → MA_BACKUP_DIR 或 .ma-backups */
  app.post('/api/ops/backup', async (_req, reply) => {
    const result = await createDbBackup();
    if (!result.success) {
      return reply.status(result.status).send({
        success: false,
        error: result.error,
        code: result.code,
      });
    }
    return {
      success: true,
      path: result.path,
      name: result.name,
      sizeBytes: result.sizeBytes,
      createdAt: result.createdAt,
      dir: result.dir,
    };
  });

  /** GET /api/ops/backups — 列出备份目录内 .db 文件 */
  app.get('/api/ops/backups', async (_req, reply) => {
    const result = listDbBackups();
    if (!result.success) {
      return reply.status(result.status).send({
        success: false,
        error: result.error,
        code: result.code,
      });
    }
    return {
      success: true,
      dir: result.dir,
      backups: result.backups,
    };
  });

  // Snapshot v1: versioned DB + global Wiki archive. Restore is validation-only.
  app.post('/api/ops/snapshots', async (_req, reply) => {
    const result = await createSnapshot();
    if (!result.success) return reply.status(result.status).send(result);
    return result;
  });

  app.get('/api/ops/snapshots', async (_req, reply) => {
    const result = listSnapshots();
    if (!result.success) return reply.status(result.status).send(result);
    return result;
  });

  async function snapshotInput(req: { body?: unknown }): Promise<string | undefined> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const value = body.name ?? body.path;
    return typeof value === 'string' ? value : undefined;
  }

  app.post('/api/ops/snapshots/validate', async (req, reply) => {
    const value = await snapshotInput(req);
    const result = validateSnapshotByName(value);
    if (!result.valid && result.errors.some((e) => /required|traversal/.test(e))) return reply.status(400).send(result);
    return result;
  });

  app.post('/api/ops/snapshots/dry-run-restore', async (req, reply) => {
    const value = await snapshotInput(req);
    const result = dryRunRestore(value);
    if (!result.valid && result.errors.some((e) => /required|traversal/.test(e))) return reply.status(400).send(result);
    return result;
  });

  // Stage extraction is isolated and read-only; it never swaps live DB/Wiki.
  app.post('/api/ops/snapshots/stage-restore', async (req, reply) => {
    const value = await snapshotInput(req);
    const result = stageSnapshotRestore(value);
    if ('success' in result && !result.success) return reply.status(result.status).send(result);
    return { success: true, stage: result };
  });

  app.delete('/api/ops/snapshot-stages/:stageId', async (req, reply) => {
    const params = req.params as { stageId: string };
    const result = removeSnapshotStage(params.stageId);
    if ('success' in result && !result.success) return reply.status(result.status).send(result);
    return result;
  });

  app.post('/api/ops/snapshot-restores/preview', async (req, reply) => {
    const stageId = String((req.body as { stageId?: unknown } | undefined)?.stageId ?? '');
    try {
      return { success: true, journal: previewSafeRestore(stageId) };
    } catch (e) {
      return reply.status(400).send({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post('/api/ops/snapshot-restores/confirm', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const journal = await confirmSafeRestore({
        journalId: String(body.journalId ?? ''),
        confirmationToken: String(body.confirmationToken ?? ''),
        confirmationPhrase: String(body.confirmationPhrase ?? ''),
      });
      return reply.status(409).send({
        success: false,
        code: 'LIVE_RESTORE_DISABLED',
        error: journal.error,
        journal,
      });
    } catch (e) {
      return reply.status(400).send({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get('/api/ops/snapshot-restores/:journalId', async (req, reply) => {
    const row = readRestoreJournal((req.params as { journalId: string }).journalId);
    if (!row) return reply.status(404).send({ success: false, error: 'restore journal not found' });
    return { success: true, journal: row };
  });

  // Friendly resource-shaped aliases for clients that prefer /:name routes.
  app.post('/api/ops/snapshots/:name/validate', async (req) => {
    const params = req.params as { name: string };
    return validateSnapshotByName(params.name);
  });
  app.post('/api/ops/snapshots/:name/dry-run-restore', async (req) => {
    const params = req.params as { name: string };
    return dryRunRestore(params.name);
  });
}

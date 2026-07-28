// Slice 51：运维快照 API（排障 JSON，非 Prometheus）
// Slice 58：DB backup / list
import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/client.js';
import { getLastShutdownSnapshot } from '../orchestration/graceful-shutdown.js';
import { buildOpsSnapshot } from '../ops-snapshot.js';
import { createDbBackup, listDbBackups } from '../ops-backup.js';
import { buildProcessHealth, type DbPingResult } from '../process-health.js';

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
}

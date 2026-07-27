// Slice 51：运维快照 API（排障 JSON，非 Prometheus）
import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/client.js';
import { buildOpsSnapshot } from '../ops-snapshot.js';
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
    const processHealth = buildProcessHealth({ now, db: pingSqlite() });
    return buildOpsSnapshot({ now, processHealth });
  });
}

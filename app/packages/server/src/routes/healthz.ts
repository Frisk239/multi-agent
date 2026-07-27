// Slice 38：进程级存活探针（非产品 Settings 诊断）
import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/client.js';
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

export async function healthzRoutes(app: FastifyInstance) {
  app.get('/healthz', async () => buildProcessHealth({ db: pingSqlite() }));
}

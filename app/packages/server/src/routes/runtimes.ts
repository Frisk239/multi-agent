import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { agents } from '../db/schema.js';
import { allBackends } from '../runtime/registry.js';

// GET /api/runtimes —— spec §5.1 双栏运行时发现页数据。
// machine 虚拟本机（不建表）；runtimes 由 allBackends().detect() + DB agent.runtime 聚合。
export async function runtimeRoutes(app: FastifyInstance) {
  app.get('/api/runtimes', async () => {
    const agentRows = db.select().from(agents).all();
    const runtimes = [];
    for (const b of allBackends()) {
      const d = await b.detect();
      const agentIds = agentRows
        .filter((a) => a.runtime === b.id)
        .map((a) => a.id);
      runtimes.push({
        id: b.id,
        label: b.label,
        installed: d.installed,
        version: d.version,
        path: d.path,
        agentIds,
      });
    }
    return {
      machine: {
        id: 'machine-local' as const,
        name: '林远 本机',
        status: 'online' as const,
        cwd: process.env.MA_WORKSPACE_CWD ?? null,
      },
      runtimes,
    };
  });
}

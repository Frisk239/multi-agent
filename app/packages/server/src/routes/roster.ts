import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agents, squads } from '../db/schema.js';

export async function rosterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents', async () => {
    const rows = db.select().from(agents).all();
    return rows.map((a) => ({ id: a.id, name: a.name, runtime: a.runtime }));
  });

  // S05：单 agent 详情（agent 详情页 profile + MCP Tab 回填用）
  app.get('/api/agents/:id', async (req) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      runtime: row.runtime,
      category: row.category,
      concurrency: row.concurrency,
      mcpServers: row.mcpServers,
    };
  });

  app.get('/api/squads', async () => {
    const rows = db.select().from(squads).all();
    return rows.map((s) => ({ id: s.id, name: s.name }));
  });
}

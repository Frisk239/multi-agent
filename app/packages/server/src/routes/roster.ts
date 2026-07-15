import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { agents, squads } from '../db/schema.js';

export async function rosterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents', async () => {
    const rows = db.select().from(agents).all();
    return rows.map((a) => ({ id: a.id, name: a.name, runtime: a.runtime }));
  });

  app.get('/api/squads', async () => {
    const rows = db.select().from(squads).all();
    return rows.map((s) => ({ id: s.id, name: s.name }));
  });
}

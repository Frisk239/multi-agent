// S09 Memory API（spec §7）
// GET  /api/memory/status  provider 名 + available
// GET  /api/memory         ?q=&limit= 检索；q 空则最近 limit 条
// POST /api/memory         curated 写入 body CreateMemoryInput
import type { FastifyInstance } from 'fastify';
import { desc } from 'drizzle-orm';
import { CreateMemoryInput } from '@ma/shared';
import { db } from '../db/client.js';
import { memoryItems } from '../db/schema.js';
import { memoryManager } from '../memory/manager.js';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/memory/status', async () => ({
    provider: memoryManager.getExternalName(),
    available: memoryManager.getExternalName() != null,
  }));

  app.get('/api/memory', async (req) => {
    const { q, limit } = req.query as { q?: string; limit?: string };
    const lim = Math.min(Number(limit) || 20, 100);
    if (q && q.trim()) {
      return memoryManager.search(q.trim(), lim);
    }
    const rows = db
      .select()
      .from(memoryItems)
      .orderBy(desc(memoryItems.createdAt))
      .limit(lim)
      .all();
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      issueId: r.issueId,
      agentId: r.agentId,
      runId: r.runId,
      text: r.text,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  });

  app.post('/api/memory', async (req, reply) => {
    const parsed = CreateMemoryInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const created = await memoryManager.addCurated(
        parsed.data.text,
        parsed.data.issueId,
      );
      if (created) {
        return reply.status(201).send({
          id: created.id,
          scope: 'workspace',
          issueId: created.issueId ?? null,
          agentId: null,
          runId: created.runId ?? null,
          text: created.text,
          createdAt: created.createdAt ?? new Date().toISOString(),
        });
      }
      // fallback：无 addRaw 时从库取最新一条
      const row = db
        .select()
        .from(memoryItems)
        .orderBy(desc(memoryItems.createdAt))
        .limit(1)
        .get();
      return reply.status(201).send(
        row
          ? {
              id: row.id,
              scope: row.scope,
              issueId: row.issueId,
              agentId: row.agentId,
              runId: row.runId,
              text: row.text,
              createdAt: new Date(row.createdAt).toISOString(),
            }
          : { ok: true },
      );
    } catch (e) {
      return reply.status(500).send({ error: String(e) });
    }
  });
}

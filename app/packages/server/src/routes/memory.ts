// S09/S10 Memory API（spec §7 / S10 §9）
// GET  /api/memory/status  provider + available + backend
// GET  /api/memory         ?q=&limit= 检索；一律 Manager.search（R8）
// POST /api/memory         curated 写入 body CreateMemoryInput（R9：依赖 addRaw 返回值）
// DELETE /api/memory/:id   memory-item-delete
import type { FastifyInstance } from 'fastify';
import { CreateMemoryInput } from '@ma/shared';
import { memoryManager } from '../memory/manager.js';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/memory/status', async () => memoryManager.getStatus());

  app.get('/api/memory', async (req) => {
    const { q, limit } = req.query as { q?: string; limit?: string };
    const lim = Math.min(Number(limit) || 20, 100);
    // S10 R8：禁止直读 memoryItems；空 q 也走 Manager（sqlite/pg 各自「最近 N」）
    return memoryManager.search(q?.trim() ?? '', lim);
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
      // 无 addRaw 时 syncTurn 路径：无 SQLite fallback（pgvector 会读错库）
      return reply.status(201).send({ ok: true });
    } catch (e) {
      return reply.status(500).send({ error: String(e) });
    }
  });

  app.delete('/api/memory/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await memoryManager.deleteById(id);
    if (!res.ok) return reply.status(res.status).send({ error: res.error });
    return { ok: true, id };
  });
}

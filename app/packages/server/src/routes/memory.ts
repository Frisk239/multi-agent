// S09/S10 Memory API（spec §7 / S10 §9）
// GET  /api/memory/status  provider + available + backend
// GET  /api/memory         ?q=&limit= 检索；一律 Manager.search（R8）
// GET  /api/memory/:id     单条详情（全文）
// POST /api/memory         curated 写入 body CreateMemoryInput（R9：依赖 addRaw 返回值）
// DELETE /api/memory/:id   memory-item-delete
import type { FastifyInstance } from 'fastify';
import { CreateMemoryInput, DeleteMemoryManyInput } from '@ma/shared';
import { memoryManager } from '../memory/manager.js';
import { db } from '../db/client.js';
import { issues } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/memory/status', async () => memoryManager.getStatus());

  app.get('/api/memory', async (req) => {
    const { q, limit, offset, includeInvalid } = req.query as { q?: string; limit?: string; offset?: string; includeInvalid?: string };
    const lim = Math.min(Number(limit) || 20, 100);
    const off = Number(offset) || 0;
    const includeInv = String(includeInvalid) === '1' || String(includeInvalid) === 'true';
    // S10 R8：禁止直读 memoryItems；空 q 也走 Manager（sqlite/pg 各自「最近 N」）
    const all = await memoryManager.search(q?.trim() ?? '', 1000, includeInv);
    const data = all.slice(off, off + lim);
    return { data, total: all.length, limit: lim, offset: off };
  });

  app.post('/api/memory', async (req, reply) => {
    const parsed = CreateMemoryInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    try {
      let text = parsed.data.text;
      if (!text && parsed.data.issueId) {
        const issue = db.select().from(issues).where(eq(issues.id, parsed.data.issueId)).get();
        if (issue) {
          text = `${issue.title}\n${issue.description || ''}`.trim();
        }
      }
      const created = await memoryManager.addCurated(
        text,
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
      return reply.status(500).send({ success: false, error: String(e)  });
    }
  });

  // 须在 :id 前：批量删除
  app.post('/api/memory/delete-many', async (req, reply) => {
    const parsed = DeleteMemoryManyInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'invalid body', details: parsed.error.flatten() });
    }
    const result = await memoryManager.deleteMany(parsed.data.ids);
    return result;
  });

  // GET 单条详情（须在与 DELETE 同路径段；method 区分）
  app.get('/api/memory/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await memoryManager.getById(id);
    if (!res.ok) return reply.status(res.status).send({ success: false, error: res.error  });
    const item = res.item;
    return {
      id: item.id,
      scope: 'workspace',
      issueId: item.issueId ?? null,
      agentId: null,
      runId: item.runId ?? null,
      text: item.text,
      createdAt: item.createdAt ?? new Date().toISOString(),
      source: item.source ?? null,
      score: item.score ?? null,
    };
  });

  app.delete('/api/memory/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await memoryManager.deleteById(id);
    if (!res.ok) return reply.status(res.status).send({ success: false, error: res.error  });
    return { ok: true, id };
  });
}

import type { FastifyInstance } from 'fastify';
import { eq, desc, asc, and, type SQL } from 'drizzle-orm';
import { ListRunsQuery } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, runMessages } from '../db/schema.js';
import { toAgentRun, toRunMessage } from '../db/reshape.js';
import { cancelRunById, retryRun } from '../orchestration/run-service.js';

// runs list / detail / messages / cancel / retry（S03 + run-observability）
export async function runRoutes(app: FastifyInstance) {
  // GET /api/runs —— issueId 可选；可按 status/agentId/kind/limit 筛选
  app.get('/api/runs', async (req, reply) => {
    const parsed = ListRunsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const q = parsed.data;
    const filters: SQL[] = [];
    if (q.issueId) filters.push(eq(agentRuns.issueId, q.issueId));
    if (q.agentId) filters.push(eq(agentRuns.agentId, q.agentId));
    if (q.status) filters.push(eq(agentRuns.status, q.status));
    if (q.kind) filters.push(eq(agentRuns.kind, q.kind));

    let query = db.select().from(agentRuns).$dynamic();
    if (filters.length === 1) query = query.where(filters[0]!);
    else if (filters.length > 1) query = query.where(and(...filters));

    const rows = query.orderBy(desc(agentRuns.createdAt)).limit(q.limit).all();
    return rows.map(toAgentRun);
  });

  // GET /api/runs/:runId —— 单条
  app.get('/api/runs/:runId', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (!row) return reply.status(404).send({ error: 'run 不存在' });
    return toAgentRun(row);
  });

  // GET /api/runs/:runId/messages —— seq ASC 轨迹回放
  app.get('/api/runs/:runId/messages', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (!run) return reply.status(404).send({ error: 'run 不存在' });
    const rows = db
      .select()
      .from(runMessages)
      .where(eq(runMessages.runId, runId))
      .orderBy(asc(runMessages.seq))
      .all();
    return rows.map(toRunMessage);
  });

  // POST /api/runs/:runId/cancel —— 唯一取消入口（spec §6.3 R1）
  app.post('/api/runs/:runId/cancel', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const res = cancelRunById(runId);
    if (!res.ok) return reply.status(409).send({ error: 'run 不可取消' });
    return res.run;
  });

  // POST /api/runs/:runId/retry —— 人工再执行（新行）；QC 无 issue → 400
  app.post('/api/runs/:runId/retry', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const res = retryRun(runId);
    if (!res.ok) return reply.status(res.status).send({ error: res.error });
    return reply.status(201).send(res.run);
  });
}

import type { FastifyInstance } from 'fastify';
import { eq, desc, asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, runMessages } from '../db/schema.js';
import { toAgentRun, toRunMessage } from '../db/reshape.js';
import { cancelRunById } from '../orchestration/run-service.js';

// runs CRUD + cancel（spec §5）。
export async function runRoutes(app: FastifyInstance) {
  // GET /api/runs?issueId= —— 列表新→旧（B5：无 issueId → 400，禁止全表）
  app.get('/api/runs', async (req, reply) => {
    const q = req.query as { issueId?: string };
    if (!q.issueId) {
      return reply.status(400).send({ error: 'issueId required' });
    }
    const rows = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.issueId, q.issueId))
      .orderBy(desc(agentRuns.createdAt))
      .all();
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
}

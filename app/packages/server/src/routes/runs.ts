import type { FastifyInstance } from 'fastify';
import { eq, desc, asc, and, inArray, type SQL } from 'drizzle-orm';
import { ListRunsQuery, type RunsActiveCount } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, runMessages } from '../db/schema.js';
import { toAgentRun, toRunMessage } from '../db/reshape.js';
import { cancelRunById, retryRun } from '../orchestration/run-service.js';
import { recoverStuckRuns } from '../orchestration/stale-runs.js';

const ACTIVE_STATUSES = ['queued', 'running'] as const;

// runs list / detail / messages / cancel / retry（S03 + run-observability）
// runs-active-nav：active 筛选 + active-count 角标
export async function runRoutes(app: FastifyInstance) {
  // GET /api/runs —— issueId 可选；可按 status/agentId/kind/isLeader/limit 筛选
  app.get('/api/runs', async (req, reply) => {
    const parsed = ListRunsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const q = parsed.data;
    const filters: SQL[] = [];
    if (q.issueId) filters.push(eq(agentRuns.issueId, q.issueId));
    if (q.agentId) filters.push(eq(agentRuns.agentId, q.agentId));
    if (q.squadId) filters.push(eq(agentRuns.squadId, q.squadId));
    if (q.status === 'active') {
      filters.push(inArray(agentRuns.status, [...ACTIVE_STATUSES]));
    } else if (q.status) {
      filters.push(eq(agentRuns.status, q.status));
    }
    if (q.kind) filters.push(eq(agentRuns.kind, q.kind));
    if (q.isLeader === '1' || q.isLeader === 'true') {
      filters.push(eq(agentRuns.isLeader, 1));
    } else if (q.isLeader === '0' || q.isLeader === 'false') {
      filters.push(eq(agentRuns.isLeader, 0));
    }

    let query = db.select().from(agentRuns).$dynamic();
    if (filters.length === 1) query = query.where(filters[0]!);
    else if (filters.length > 1) query = query.where(and(...filters));

    const rows = query.orderBy(desc(agentRuns.createdAt)).limit(q.limit).all();
    return rows.map(toAgentRun);
  });

  // GET /api/runs/active-count —— 侧栏「运行」角标（须在 :runId 前注册）
  app.get('/api/runs/active-count', async (): Promise<RunsActiveCount> => {
    const rows = db
      .select({ status: agentRuns.status })
      .from(agentRuns)
      .where(inArray(agentRuns.status, [...ACTIVE_STATUSES]))
      .all();
    let queued = 0;
    let running = 0;
    for (const r of rows) {
      if (r.status === 'queued') queued += 1;
      else if (r.status === 'running') running += 1;
    }
    return { count: queued + running, queued, running };
  });

  // POST /api/runs/recover-stuck —— 运维：立即收尸 orphan/stale/missing-agent（须在 :runId 前）
  app.post('/api/runs/recover-stuck', async () => {
    return recoverStuckRuns();
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

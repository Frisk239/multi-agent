import type { FastifyInstance } from 'fastify';
import { eq, desc, asc, and, inArray, type SQL, sql } from 'drizzle-orm';
import {
  CancelRunsManyInput,
  ListRunsQuery,
  RetryRunInput,
  type RunsActiveCount,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, runMessages } from '../db/schema.js';
import { toAgentRun, toRunMessage } from '../db/reshape.js';
import { cancelRunById, cancelRunsMany, retryRun } from '../orchestration/run-service.js';
import { recoverStuckRuns } from '../orchestration/stale-runs.js';
import { enrichRunRowWithPathLock } from '../orchestration/path-lock.js';
import { getRunTree, getDirectChildren } from '../orchestration/subagent-tree.js';

const ACTIVE_STATUSES = [
  'queued',
  'waiting_local_directory',
  'running',
] as const;

function withAutoRetrySummary(row: typeof agentRuns.$inferSelect) {
  const child = db
    .select({ id: agentRuns.id, status: agentRuns.status, nextAttemptAt: agentRuns.nextAttemptAt })
    .from(agentRuns)
    .where(eq(agentRuns.autoRetryOfRunId, row.id))
    .get();
  const run = toAgentRun(row);
  return {
    ...run,
    // Surface the child's durable backoff on the source row so list/detail
    // consumers can render one retry status without a second request.
    nextAttemptAt: run.nextAttemptAt ??
      (child?.nextAttemptAt == null ? null : new Date(child.nextAttemptAt).toISOString()),
    autoRetryStatus:
      child && ACTIVE_STATUSES.includes(child.status as (typeof ACTIVE_STATUSES)[number])
        ? ('scheduled' as const)
        : ('none' as const),
    autoRetryChildId: child?.id ?? null,
    autoRetryNextAttemptAt:
      child?.nextAttemptAt == null ? null : new Date(child.nextAttemptAt).toISOString(),
  };
}

// runs list / detail / messages / cancel / retry（S03 + run-observability）
// runs-active-nav：active 筛选 + active-count 角标
export async function runRoutes(app: FastifyInstance) {
  // GET /api/runs —— issueId 可选；可按 status/agentId/kind/isLeader/limit 筛选
  app.get('/api/runs', async (req, reply) => {
    const parsed = ListRunsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const q = parsed.data;
    const filters: SQL[] = [];
    if (q.issueId) filters.push(eq(agentRuns.issueId, q.issueId));
    if (q.agentId) filters.push(eq(agentRuns.agentId, q.agentId));
    if (q.squadId) filters.push(eq(agentRuns.squadId, q.squadId));
    if (q.chatThreadId) filters.push(eq(agentRuns.chatThreadId, q.chatThreadId));
    if (q.parentRunId) filters.push(eq(agentRuns.parentRunId, q.parentRunId));
    if (q.autoRetryOfRunId) filters.push(eq(agentRuns.autoRetryOfRunId, q.autoRetryOfRunId));
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

    const whereClause = filters.length === 1 ? filters[0]! : filters.length > 1 ? and(...filters) : undefined;
    const totalRow = db.select({ count: sql<number>`count(*)` }).from(agentRuns).where(whereClause).get();
    const total = totalRow?.count ?? 0;
    const limit = q.limit;
    const offset = q.offset;

    const rows = query.orderBy(desc(agentRuns.createdAt)).limit(limit).offset(offset).all();
    const data = rows.map((row) => enrichRunRowWithPathLock(row, withAutoRetrySummary(row)));
    return { data, total, limit, offset };
  });

  // GET /api/runs/active-count —— 侧栏「运行」角标（须在 :runId 前注册）
  app.get('/api/runs/active-count', async (): Promise<RunsActiveCount> => {
    const rows = db
      .select({ status: agentRuns.status, agentId: agentRuns.agentId })
      .from(agentRuns)
      .where(inArray(agentRuns.status, [...ACTIVE_STATUSES]))
      .all();
    let queued = 0;
    let running = 0;
    let waitingLocalDirectory = 0;
    const agents = new Set<string>();
    for (const r of rows) {
      if (r.status === 'queued') queued += 1;
      else if (r.status === 'waiting_local_directory') waitingLocalDirectory += 1;
      else if (r.status === 'running') running += 1;
      if (r.agentId) agents.add(r.agentId);
    }
    return {
      count: queued + waitingLocalDirectory + running,
      queued,
      running,
      waitingLocalDirectory,
      agentsWorking: agents.size,
    };
  });

  // POST /api/runs/recover-stuck —— 运维：立即收尸 orphan/stale/missing-agent（须在 :runId 前）
  app.post('/api/runs/recover-stuck', async () => {
    return recoverStuckRuns();
  });

  // POST /api/runs/cancel-many —— 批量取消 active runs（须在 :runId 前）
  app.post('/api/runs/cancel-many', async (req, reply) => {
    const parsed = CancelRunsManyInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'invalid body', details: parsed.error.flatten() });
    }
    const result = cancelRunsMany(parsed.data.ids);
    return {
      requested: result.requested,
      cancelled: result.cancelled,
      skipped: result.skipped,
    };
  });

  // GET /api/runs/:runId —— 单条
  app.get('/api/runs/:runId', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (!row) return reply.status(404).send({ success: false, error: 'run 不存在'  });
    return enrichRunRowWithPathLock(row, withAutoRetrySummary(row));
  });

  // GET /api/runs/:runId/messages —— seq ASC 轨迹回放
  app.get('/api/runs/:runId/messages', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (!run) return reply.status(404).send({ success: false, error: 'run 不存在'  });
    const rows = db
      .select()
      .from(runMessages)
      .where(eq(runMessages.runId, runId))
      .orderBy(asc(runMessages.seq))
      .all();
    return rows.map(toRunMessage);
  });

  // GET /api/runs/:runId/tree —— S22 (S8): 获取 Run 的完整子代理层级树与摘要
  app.get('/api/runs/:runId/tree', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const tree = getRunTree(runId);
    if (!tree) return reply.status(404).send({ success: false, error: 'run 不存在' });
    return { data: tree };
  });

  // GET /api/runs/:runId/children —— S22 (S8): 获取 Run 的直接子代理列表及摘要
  app.get('/api/runs/:runId/children', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const children = getDirectChildren(runId);
    return { data: children };
  });

  // POST /api/runs/:runId/cancel —— 唯一取消入口（spec §6.3 R1）
  app.post('/api/runs/:runId/cancel', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const res = cancelRunById(runId);
    if (!res.ok) return reply.status(409).send({ success: false, error: 'run 不可取消'  });
    return res.run;
  });

  // POST /api/runs/:runId/retry —— 人工再执行（新行）；QC 无 issue → 400
  // Slice 67：可选 body { forceFresh?: boolean }
  app.post('/api/runs/:runId/retry', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const body = req.body === undefined || req.body === null ? {} : req.body;
    const parsed = RetryRunInput.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }
    const res = await retryRun(runId, {
      forceFresh: parsed.data.forceFresh === true,
    });
    if (!res.ok) return reply.status(res.status).send({ success: false, error: res.error  });
    return reply.status(201).send(res.run);
  });
}


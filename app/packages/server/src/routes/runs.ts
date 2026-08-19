import type { FastifyInstance } from 'fastify';
import { eq, desc, asc, and, gt, lt, inArray, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  CancelRunsManyInput,
  ListRunMessagesQuery,
  ListRunsQuery,
  RetryRunInput,
  RunCommandInput,
  type RunsActiveCount,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, chatThreads, issues, projects, runMessages } from '../db/schema.js';
import { toObservedAgentRun, toRunMessage } from '../db/reshape.js';
import { cancelRunById, cancelRunsMany, retryRun } from '../orchestration/run-service.js';
import { recoverStuckRuns } from '../orchestration/stale-runs.js';
import { enrichRunRowWithPathLock } from '../orchestration/path-lock.js';
import { getRunTree, getDirectChildren } from '../orchestration/subagent-tree.js';
import { getBackend } from '../runtime/registry.js';
import {
  messageWindowLimit,
  messageWindowNewestFirst,
  resolveRunMessagesWindow,
} from './run-messages-window.js';

const ACTIVE_STATUSES = [
  'queued',
  'waiting_local_directory',
  'running',
] as const;

// 固定连接三个项目来源，避免按行读取 Issue / Thread / Project。
const issueProjects = alias(projects, 'run_issue_project');
const chatProjects = alias(projects, 'run_chat_project');
const runProjects = alias(projects, 'run_direct_project');

const effectiveProjectId = sql<string | null>`coalesce(${issues.projectId}, ${chatThreads.projectId}, ${agentRuns.projectId})`;
const effectiveProjectTitle = sql<string | null>`coalesce(${issueProjects.title}, ${chatProjects.title}, ${runProjects.title})`;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function withSubject(
  row: {
    run: typeof agentRuns.$inferSelect;
    subjectIssueId: string | null;
    subjectIssueIdentifier: string | null;
    subjectIssueTitle: string | null;
    subjectChatId: string | null;
    subjectChatTitle: string | null;
    subjectProjectId: string | null;
    subjectProjectTitle: string | null;
  },
  now = Date.now(),
) {
  return {
    ...enrichRunRowWithPathLock(row.run, withAutoRetrySummary(row.run, now)),
    subject: {
      issue:
        row.subjectIssueId && row.subjectIssueIdentifier != null && row.subjectIssueTitle != null
          ? {
              id: row.subjectIssueId,
              identifier: row.subjectIssueIdentifier,
              title: row.subjectIssueTitle,
            }
          : null,
      chat:
        row.subjectChatId && row.subjectChatTitle != null
          ? { id: row.subjectChatId, title: row.subjectChatTitle }
          : null,
      project:
        row.subjectProjectId && row.subjectProjectTitle != null
          ? { id: row.subjectProjectId, title: row.subjectProjectTitle }
          : null,
    },
  };
}

function withAutoRetrySummary(row: typeof agentRuns.$inferSelect, now = Date.now()) {
  const child = db
    .select({ id: agentRuns.id, status: agentRuns.status, nextAttemptAt: agentRuns.nextAttemptAt })
    .from(agentRuns)
    .where(eq(agentRuns.autoRetryOfRunId, row.id))
    .get();
  const run = toObservedAgentRun(row, now);
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
  // GET /api/runs —— 在 DB 端按运行、任务/会话文本和有效项目定位。
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
    if (q.projectId) filters.push(sql`${effectiveProjectId} = ${q.projectId}`);
    if (q.q) {
      const needle = `%${escapeLike(q.q)}%`;
      filters.push(sql`(
        lower(${issues.identifier}) LIKE lower(${needle}) ESCAPE '\\'
        OR lower(${issues.title}) LIKE lower(${needle}) ESCAPE '\\'
        OR lower(${chatThreads.title}) LIKE lower(${needle}) ESCAPE '\\'
        OR lower(${effectiveProjectTitle}) LIKE lower(${needle}) ESCAPE '\\'
      )`);
    }
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

    let query = db
      .select({
        run: agentRuns,
        subjectIssueId: issues.id,
        subjectIssueIdentifier: issues.identifier,
        subjectIssueTitle: issues.title,
        subjectChatId: chatThreads.id,
        subjectChatTitle: chatThreads.title,
        subjectProjectId: effectiveProjectId,
        subjectProjectTitle: effectiveProjectTitle,
      })
      .from(agentRuns)
      .leftJoin(issues, eq(agentRuns.issueId, issues.id))
      .leftJoin(chatThreads, eq(agentRuns.chatThreadId, chatThreads.id))
      .leftJoin(issueProjects, eq(issues.projectId, issueProjects.id))
      .leftJoin(chatProjects, eq(chatThreads.projectId, chatProjects.id))
      .leftJoin(runProjects, eq(agentRuns.projectId, runProjects.id))
      .$dynamic();
    if (filters.length === 1) query = query.where(filters[0]!);
    else if (filters.length > 1) query = query.where(and(...filters));

    const whereClause = filters.length === 1 ? filters[0]! : filters.length > 1 ? and(...filters) : undefined;
    const totalRow = db
      .select({ count: sql<number>`count(*)` })
      .from(agentRuns)
      .leftJoin(issues, eq(agentRuns.issueId, issues.id))
      .leftJoin(chatThreads, eq(agentRuns.chatThreadId, chatThreads.id))
      .leftJoin(issueProjects, eq(issues.projectId, issueProjects.id))
      .leftJoin(chatProjects, eq(chatThreads.projectId, chatProjects.id))
      .leftJoin(runProjects, eq(agentRuns.projectId, runProjects.id))
      .where(whereClause)
      .get();
    const total = totalRow?.count ?? 0;
    const limit = q.limit;
    const offset = q.offset;

    const rows = query.orderBy(desc(agentRuns.createdAt)).limit(limit).offset(offset).all();
    const now = Date.now();
    const data = rows.map((row) => withSubject(row, now));
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
    const parsed = ListRunMessagesQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }
    const run = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (!run) return reply.status(404).send({ success: false, error: 'run 不存在'  });
    const win = resolveRunMessagesWindow(parsed.data);
    const cond =
      win.mode === 'after'
        ? and(eq(runMessages.runId, runId), gt(runMessages.seq, win.afterSeq))
        : win.mode === 'before'
          ? and(eq(runMessages.runId, runId), lt(runMessages.seq, win.beforeSeq))
          : eq(runMessages.runId, runId);
    const newestFirst = messageWindowNewestFirst(win);
    let query = db
      .select()
      .from(runMessages)
      .where(cond)
      .orderBy(newestFirst ? desc(runMessages.seq) : asc(runMessages.seq))
      .$dynamic();
    const limit = messageWindowLimit(win);
    if (limit !== undefined) query = query.limit(limit);
    const rows = query.all();
    if (newestFirst) rows.reverse();
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

  // POST /api/runs/:runId/command —— G1-1 运行中 RPC 命令（pi steer/compact/set_model，rpc-types.ts:20-72 子集）
  app.post('/api/runs/:runId/command', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const parsed = RunCommandInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'invalid body',
        details: parsed.error.flatten(),
      });
    }
    const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    if (!row) return reply.status(404).send({ success: false, error: 'run 不存在'  });
    if (row.status !== 'running') {
      return reply.status(409).send({
        success: false,
        error: `run 状态为 ${row.status}，仅 running 可发送运行中命令`,
      });
    }
    const backend = getBackend(row.runtime);
    if (!backend.sendRunCommand) {
      return reply.status(501).send({
        success: false,
        error: `runtime ${row.runtime} 不支持运行中命令（steer/compact/set_model）`,
      });
    }
    const result = await backend.sendRunCommand(runId, parsed.data);
    if (!result.ok) {
      return reply.status(502).send({ success: false, error: result.error ?? '命令发送失败'  });
    }
    return { ok: true, command: parsed.data.command };
  });
}


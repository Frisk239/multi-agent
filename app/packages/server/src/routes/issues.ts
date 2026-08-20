import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like, or, isNull, sql } from 'drizzle-orm';
import {
  CreateIssueInput,
  UpdateIssueInput,
  RerunIssueInput,
  SetIssueLabelsInput,
  ListIssuesQuery,
  SearchIssuesQuery,
  ReorderIssuesInput,
  validateUpdateIssue,
  BulkUpdateIssueStatusInput,
  BulkUpdateIssueAssigneeInput,
  BulkDeleteIssuesInput,
  IssueImportInput,
  type AssigneeType,
  type EnqueueSkipReason,
  type Issue,
  type IssueEnqueueMeta,
  type IssueRunUsage,
  type IssueExportV1,
} from '@ma/shared';
import { db, sqlite } from '../db/client.js';
import { estimateCost, loadModelRates } from '../runtime/model-rates.js';
import {
  issues,
  comments,
  issueLabels,
  issueToLabels,
  agentRuns,
  inboxItems,
  issueSubscribers,
  wikiIngestJobs,
  activityLogs,
  agents,
} from '../db/schema.js';
import { recordActivityLog } from '../orchestration/activity-logger.js';
import {
  toIssue,
  toComment,
  loadLabelsByIssueIds,
  loadChildProgressByParentIds,
  loadParentIdentifiers,
  loadProjectTitles,
} from '../db/reshape.js';
import { projects } from '../db/schema.js';
import { eventBus } from '../orchestration/event-bus.js';
import {
  cancelActiveRunsForIssue,
  enqueueAgentRun,
  enqueueLeaderRun,
  rerunIssue,
  toIssueEnqueueMeta,
  type EnqueueResult,
} from '../orchestration/run-service.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { LOCAL_MEMBER } from '../local-member.js';
import {
  ensureIssueSubscriber,
  getIssueSubscription,
  notifyAssigned,
  removeIssueSubscriber,
} from '../orchestration/inbox-writer.js';
import { enqueueWikiIngest } from '../wiki/ingest-queue.js';
import {
  propagateChildDoneBatch,
  type ChildStatusChange,
} from '../orchestration/child-done-propagation.js';
import { projectSearchHits } from '../issue-search.js';

/** S6：单次搜索最多扫这么多行，避免大库把 UI 卡死（对齐上游的超时保护意图）。 */
const SEARCH_SCAN_LIMIT = 500;

/**
 * S6：搜索墙钟预算（ms）。
 *
 * SQLite 等价物说明（对照 multica search.go 的 Postgres `statement_timeout=3s` → 503）：
 * better-sqlite3 是同步驱动，不暴露语句级中断（无 sqlite3_interrupt），
 * 无法真打断一条正在跑的 LIKE。等价物 = 两层组合：
 * 1. SEARCH_SCAN_LIMIT 行数上限：两条 LIKE 都 LIMIT 500，SQLite 凑够即停，结果集不爆炸；
 * 2. 本墙钟预算：两条 LIKE 总耗时超限 → 快速 503（SEARCH_TIMEOUT），
 *    跳过 extraRows 补齐与投影，客户端不无限转圈（对齐 multica 的 503 语义）。
 * 差异：极端大库下单条语句仍会跑完（同步驱动做不到中途取消），但请求侧
 * 立即收到 503 而非挂起，且行数上限保证单次请求工作量有界。
 * MA_SEARCH_TIMEOUT_MS 可覆盖（0/非法 → 回落默认）。
 */
const DEFAULT_SEARCH_TIMEOUT_MS = 3_000;

export function resolveSearchTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.MA_SEARCH_TIMEOUT_MS;
  if (raw == null || String(raw).trim() === '') {
    return DEFAULT_SEARCH_TIMEOUT_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SEARCH_TIMEOUT_MS;
  return Math.floor(n);
}
import { wakeWikiIngestWorker } from '../wiki/ingest-worker.js';
import { memoryManager } from '../memory/manager.js';
import { createIssueCore } from '../orchestration/issue-create.js';
import { computeAgentReadiness } from '../orchestration/readiness.js';

function allowNotReadyEnqueue(): boolean {
  const v = process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  return v === '1' || v === 'true';
}

type AssignmentTarget = { type: AssigneeType; id: string } | null;

type AssignmentDispatchTarget =
  | { kind: 'agent'; agentId: string }
  | { kind: 'squad'; agentId: string; squadId: string };

type AssignmentPreflightSuccess = {
  ok: true;
  target: AssignmentTarget;
  dispatch: AssignmentDispatchTarget | null;
};

type AssignmentPreflightFailure = {
  ok: false;
  status: 400 | 404;
  error: string;
  code?: 'readiness_failed';
  reason?: EnqueueSkipReason;
};

type AssignmentPreflight = AssignmentPreflightSuccess | AssignmentPreflightFailure;

/**
 * 单条与批量改指派的共同目标门禁。
 *
 * 这一步只校验目标，不写 Issue/activity/run：batch 可在自己的 SQLite
 * transaction 前一次性失败，避免一半卡已改指派、一半才发现 target 无法开工。
 */
async function preflightAssignmentTarget(
  target: AssignmentTarget,
): Promise<AssignmentPreflight> {
  // 未指派/本地成员不是 runtime dispatch 目标，但仍是合法的多态指派值。
  if (!target || target.type === 'member') {
    return { ok: true, target, dispatch: null };
  }

  let dispatch: AssignmentDispatchTarget;
  if (target.type === 'agent') {
    const agent = db.select().from(agents).where(eq(agents.id, target.id)).get();
    if (!agent) {
      return { ok: false, status: 404, error: 'agent 不存在' };
    }
    dispatch = { kind: 'agent', agentId: agent.id };
  } else {
    const squad = loadSquadDetail(target.id);
    if (!squad) {
      return { ok: false, status: 404, error: '小队不存在' };
    }
    if (!squad.leaderId) {
      return {
        ok: false,
        status: 400,
        error: `小队「${squad.name}」无 leader，无法开工`,
        code: 'readiness_failed',
        reason: 'no_leader',
      };
    }
    const leader = db
      .select()
      .from(agents)
      .where(eq(agents.id, squad.leaderId))
      .get();
    if (!leader) {
      return { ok: false, status: 404, error: 'agent 不存在' };
    }
    dispatch = { kind: 'squad', agentId: leader.id, squadId: squad.id };
  }

  // MA_ENQUEUE_ALLOW_NOT_READY 仅绕过环境 readiness，不能放过不存在的
  // agent/squad 或无 leader 的坏目标（它们已在上面同步拒绝）。
  if (!allowNotReadyEnqueue()) {
    const readiness = await computeAgentReadiness(dispatch.agentId);
    if (!readiness) {
      return { ok: false, status: 404, error: 'agent 不存在' };
    }
    if (
      readiness.status === 'cwd_missing' ||
      readiness.status === 'runtime_missing' ||
      readiness.status === 'error'
    ) {
      return {
        ok: false,
        status: 400,
        error: readiness.detail ?? `agent 就绪探测失败 (${readiness.status})`,
        code: 'readiness_failed',
        reason:
          readiness.status === 'error' ? 'readiness_error' : readiness.status,
      };
    }
  }

  return { ok: true, target, dispatch };
}

/**
 * 单张实际改派的通知与排队决策。此 helper 自身从不取消旧 run：PUT 显式传入
 * 自己已有的取消语义，batch 则不传，保证批量操作不能借道取消活跃工作。
 */
async function dispatchIssueAssignment(
  issue: Issue,
  preflight: AssignmentPreflightSuccess,
  beforeEnqueue?: () => void,
): Promise<EnqueueResult | null> {
  if (preflight.target) {
    notifyAssigned(issue);
  } else {
    ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'assignee_watch');
  }

  // PUT uses this hook to retain its historical cancel-before-new-enqueue
  // behavior. POST /bulk-assign deliberately supplies no hook.
  beforeEnqueue?.();

  if (!preflight.dispatch) return null;

  try {
    if (preflight.dispatch.kind === 'agent') {
      return await enqueueAgentRun(issue.id, preflight.dispatch.agentId);
    }
    return await enqueueLeaderRun(
      issue.id,
      preflight.dispatch.agentId,
      preflight.dispatch.squadId,
    );
  } catch (error) {
    return {
      run: null,
      skipped: true,
      reason: 'readiness_error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

const WS_ID = 'ws-local';

function issueWithLabels(row: typeof issues.$inferSelect) {
  const labels = loadLabelsByIssueIds([row.id]).get(row.id) ?? [];
  const parentIds = row.parentIssueId ? [row.parentIssueId] : [];
  const parentMap = loadParentIdentifiers(parentIds);
  const progressMap = loadChildProgressByParentIds([row.id]);
  const projectMap = loadProjectTitles(row.projectId ? [row.projectId] : []);
  return toIssue(row, labels, {
    parentIdentifier: row.parentIssueId
      ? (parentMap.get(row.parentIssueId) ?? null)
      : null,
    childProgress: progressMap.get(row.id) ?? null,
    projectTitle: row.projectId ? (projectMap.get(row.projectId) ?? null) : null,
  });
}

function issuesWithRelations(rows: (typeof issues.$inferSelect)[]) {
  const labelMap = loadLabelsByIssueIds(rows.map((r) => r.id));
  const parentMap = loadParentIdentifiers(
    rows.map((r) => r.parentIssueId).filter((id): id is string => Boolean(id)),
  );
  const progressMap = loadChildProgressByParentIds(rows.map((r) => r.id));
  const projectMap = loadProjectTitles(
    rows.map((r) => r.projectId).filter((id): id is string => Boolean(id)),
  );
  return rows.map((r) =>
    toIssue(r, labelMap.get(r.id) ?? [], {
      parentIdentifier: r.parentIssueId
        ? (parentMap.get(r.parentIssueId) ?? null)
        : null,
      childProgress: progressMap.get(r.id) ?? null,
      projectTitle: r.projectId ? (projectMap.get(r.projectId) ?? null) : null,
    }),
  );
}

export async function issueRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/issues —— issue-find + issue-assignee-desk：q / labelId / status / assignee*
  app.get('/api/issues', async (req, reply) => {
    const parsed = ListIssuesQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const {
      q,
      labelId,
      status,
      priority,
      originType,
      projectId,
      assigneeType,
      assigneeId,
      unassigned,
      assigned,
      sort,
    } = parsed.data;
    const qTrim = q?.trim() ?? '';
    const unassignedOn = unassigned === '1' || unassigned === 'true';
    const assignedOn = assigned === '1' || assigned === 'true';
    // DS2：默认 manual（看板 position）；列表可传 updated
    const orderBy =
      sort === 'updated'
        ? [sql`updated_at DESC`, issues.position]
        : [issues.position, sql`created_at DESC`];

    const filters = [eq(issues.workspaceId, WS_ID)];

    if (status) filters.push(eq(issues.status, status));
    if (priority) filters.push(eq(issues.priority, priority));
    if (originType) filters.push(eq(issues.originType, originType));
    if (projectId) filters.push(eq(issues.projectId, projectId));
    
    if (qTrim) {
      const needle = `%${qTrim.toLowerCase()}%`;
      filters.push(
        or(
          like(issues.identifier, needle),
          like(issues.title, needle),
          like(issues.description, needle)
        )!
      );
    }
    
    if (unassignedOn) {
      filters.push(isNull(issues.assigneeId));
    } else if (assigneeType && assigneeId) {
      filters.push(and(eq(issues.assigneeType, assigneeType), eq(issues.assigneeId, assigneeId))!);
    } else if (assignedOn) {
      filters.push(inArray(issues.assigneeType, ['agent', 'squad']));
    }

    if (labelId) {
      const lab = db
        .select()
        .from(issueLabels)
        .where(and(eq(issueLabels.id, labelId), eq(issueLabels.workspaceId, WS_ID)))
        .get();
      if (!lab || lab.archivedAt != null) {
        return reply.status(400).send({ success: false, error: 'labelId 无效或已归档'  });
      }
      filters.push(
        inArray(
          issues.id,
          db.select({ id: issueToLabels.issueId }).from(issueToLabels).where(eq(issueToLabels.labelId, labelId))
        )
      );
    }

    const whereClause = and(...filters);

    const totalRow = db.select({ count: sql<number>`count(*)` }).from(issues).where(whereClause).get();
    const total = totalRow?.count ?? 0;

    const rows = db
      .select()
      .from(issues)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(parsed.data.limit)
      .offset(parsed.data.offset)
      .all();

    const data = issuesWithRelations(rows);
    return { data, total, limit: parsed.data.limit, offset: parsed.data.offset };
  });

  /**
   * S6：GET /api/issues/search?q=&limit= —— 覆盖 identifier/title/description/**评论正文**。
   * 与 GET /api/issues 的 q 分开：那个是列表筛选，这个是「找回」，要带 snippet 与 commentId。
   * 必须注册在 /api/issues/:id 之前，否则 "search" 会被 :id 吃掉。
   */
  app.get('/api/issues/search', async (req, reply) => {
    const parsed = SearchIssuesQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }
    const q = parsed.data.q.trim();
    if (!q) return { data: [], total: 0, query: '' };

    const needle = `%${q.toLowerCase()}%`;

    // S6：墙钟预算起点（只包两条 LIKE 扫描；投影/补齐在超限检查之后，超限即跳过）
    const searchTimeoutMs = resolveSearchTimeoutMs();
    const searchStartedAt = performance.now();

    // 先按 identifier/title/description 捞一批，再单独捞命中评论的 issue，
    // 合并后交给纯函数做「每 issue 一条 + 最强来源」的投影。
    const directRows = db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.workspaceId, WS_ID),
          or(
            like(issues.identifier, needle),
            like(issues.title, needle),
            like(issues.description, needle),
          )!,
        ),
      )
      .limit(SEARCH_SCAN_LIMIT)
      .all();

    const commentRows = db
      .select({
        id: comments.id,
        issueId: comments.issueId,
        body: comments.body,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.type, 'comment'), like(comments.body, needle)))
      .limit(SEARCH_SCAN_LIMIT)
      .all();

    // S6：超预算 → 快速失败（对齐 multica 超时 503；不做补齐/投影，客户端不转圈）
    if (performance.now() - searchStartedAt > searchTimeoutMs) {
      return reply.status(503).send({
        success: false,
        error: '搜索超时：数据量过大或关键词过泛，请缩小关键词后重试',
        code: 'SEARCH_TIMEOUT',
      });
    }

    const commentsByIssue = new Map<string, Array<{ id: string; body: string; createdAt: number }>>();
    for (const c of commentRows) {
      const arr = commentsByIssue.get(c.issueId) ?? [];
      arr.push({ id: c.id, body: c.body, createdAt: c.createdAt });
      commentsByIssue.set(c.issueId, arr);
    }

    // 补齐只命中评论、但不在 directRows 里的 issue
    const seen = new Set(directRows.map((r) => r.id));
    const extraIds = [...commentsByIssue.keys()].filter((id) => !seen.has(id));
    const extraRows =
      extraIds.length > 0
        ? db
            .select()
            .from(issues)
            .where(and(eq(issues.workspaceId, WS_ID), inArray(issues.id, extraIds)))
            .all()
        : [];

    const candidates = [...directRows, ...extraRows].map((r) => ({
      issueId: r.id,
      identifier: r.identifier,
      title: r.title,
      description: r.description,
      comments: commentsByIssue.get(r.id) ?? [],
    }));

    const data = projectSearchHits(candidates, q, { limit: parsed.data.limit });
    return { data, total: data.length, query: q };
  });

  // POST /api/issues/reorder —— DS2：整列重排（orderedIds → position 0..n-1）
  // 注意：须注册在 /api/issues/:id 之前，避免被 :id 吃掉 "reorder"
  app.post('/api/issues/reorder', async (req, reply) => {
    const parsed = ReorderIssuesInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const { status: targetStatus, orderedIds } = parsed.data;
    if (new Set(orderedIds).size !== orderedIds.length) {
      return reply.status(400).send({ success: false, error: 'orderedIds 含重复 id'  });
    }

    const now = Date.now();
    const statusChanges: Array<{
      issueId: string;
      from: (typeof issues.$inferSelect)['status'];
      to: (typeof issues.$inferSelect)['status'];
      commentId: string;
    }> = [];

    try {
      sqlite.transaction(() => {
        const rows = orderedIds.map((id) => {
          const row = db.select().from(issues).where(eq(issues.id, id)).get();
          if (!row) throw new Error(`missing:${id}`);
          if (row.workspaceId !== WS_ID) throw new Error(`workspace:${id}`);
          return row;
        });

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]!;
          const nextPos = i;
          const statusChanged = row.status !== targetStatus;
          const patch: Partial<typeof issues.$inferInsert> = {
            position: nextPos,
            updatedAt: now,
          };
          if (statusChanged) {
            patch.status = targetStatus;
            const commentId = crypto.randomUUID();
            db.insert(comments)
              .values({
                id: commentId,
                issueId: row.id,
                type: 'status_change',
                authorType: 'member',
                authorId: LOCAL_MEMBER.id,
                body: JSON.stringify({ from: row.status, to: targetStatus }),
                createdAt: now,
              })
              .run();
            statusChanges.push({
              issueId: row.id,
              from: row.status,
              to: targetStatus,
              commentId,
            });
          }
          db.update(issues).set(patch).where(eq(issues.id, row.id)).run();
        }
      })();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('missing:')) {
        return reply.status(404).send({ success: false, error: `issue 不存在: ${msg.slice(8)}` });
      }
      if (msg.startsWith('workspace:')) {
        return reply.status(404).send({ error: `issue 不存在: ${msg.slice(10)}` });
      }
      throw e;
    }

    const updatedRows = orderedIds.map(
      (id) => db.select().from(issues).where(eq(issues.id, id)).get()!,
    );
    const result = issuesWithRelations(updatedRows);

    for (const issue of result) {
      const sc = statusChanges.find((s) => s.issueId === issue.id);
      eventBus.publish({
        type: 'issue:updated',
        issue,
        statusChanged: Boolean(sc),
        prevStatus: sc?.from ?? null,
      });
    }
    // S2：拖拽跨列也可能让最后一个子任务收口
    try {
      await propagateChildDoneBatch(
        statusChanges.map((sc) => {
          const row = updatedRows.find((r) => r.id === sc.issueId);
          return {
            issueId: sc.issueId,
            parentIssueId: row?.parentIssueId ?? null,
            prevStatus: sc.from,
            nextStatus: sc.to,
            // W7：变更子带 stage 时走阶段屏障
            stage: row?.stage ?? null,
          };
        }),
      );
    } catch (e) {
      app.log.warn({ err: e }, 'child-done propagation failed (reorder)');
    }

    for (const sc of statusChanges) {
      const cRow = db.select().from(comments).where(eq(comments.id, sc.commentId)).get();
      if (cRow) {
        eventBus.publish({ type: 'comment:created', comment: toComment(cRow) });
      }
      if (sc.to === 'done') {
        const jobId = enqueueWikiIngest(sc.issueId);
        if (jobId) wakeWikiIngestWorker();
        const iss = result.find((i) => i.id === sc.issueId);
        if (iss) {
          const desc = iss.description?.trim()
            ? `\n${iss.description.length > 500 ? iss.description.slice(0, 500) : iss.description}`
            : '';
          memoryManager.ambientCapture({
            kind: 'issue_done',
            issueId: sc.issueId,
            projectId: iss.projectId ?? null,
            text: `[ambient:issue_done] Issue ${iss.identifier}: ${iss.title}\nStatus → done${desc}`,
          });
        }
      }
    }

    return reply.send(result);
  });

  // GET /api/issues/:id —— 与 list 共用 toIssue（R6）
  app.get('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!row) return reply.status(404).send({ success: false, error: 'issue 不存在'  });
    return issueWithLabels(row);
  });

  // GET /api/issues/:id/children —— 子 issue 列表（创建序）
  app.get('/api/issues/:id/children', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parent = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!parent) return reply.status(404).send({ success: false, error: 'issue 不存在'  });
    const rows = db
      .select()
      .from(issues)
      .where(eq(issues.parentIssueId, id))
      .orderBy(sql`CAST(SUBSTR(${issues.identifier}, 5) AS INTEGER) ASC`)
      .all();
    return issuesWithRelations(rows);
  });

  // GET /api/issues/:id/subscription —— 本地 member 关注状态
  app.get('/api/issues/:id/subscription', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!row) return reply.status(404).send({ success: false, error: 'issue 不存在'  });
    const sub = getIssueSubscription(id, 'member', LOCAL_MEMBER.id);
    return {
      issueId: id,
      subscribed: sub.subscribed,
      reason: sub.reason,
    };
  });

  // POST /api/issues/:id/subscribe —— 关注
  app.post('/api/issues/:id/subscribe', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!row) return reply.status(404).send({ success: false, error: 'issue 不存在'  });
    db.insert(issueSubscribers)
      .values({ issueId: id, userType: 'member', userId: LOCAL_MEMBER.id, reason: 'manual', createdAt: Date.now() })
      .onConflictDoUpdate({
        target: [issueSubscribers.issueId, issueSubscribers.userType, issueSubscribers.userId],
        set: { reason: 'manual' }
      }).run();
    const sub = getIssueSubscription(id, 'member', LOCAL_MEMBER.id);
    return {
      issueId: id,
      subscribed: true,
      reason: sub.reason,
    };
  });

  // POST /api/issues/:id/unsubscribe —— 取消关注
  app.post('/api/issues/:id/unsubscribe', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!row) return reply.status(404).send({ success: false, error: 'issue 不存在'  });
    removeIssueSubscriber(id, 'member', LOCAL_MEMBER.id);
    return {
      issueId: id,
      subscribed: false,
      reason: null,
    };
  });

  // POST /api/issues —— spec §5.2；bu03/bu05：createIssueCore（origin + enqueue）
  app.post('/api/issues', async (req, reply) => {
    const parsed = CreateIssueInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const input = parsed.data;

    // F2：labels 先校验（存在 / 归属本工作区 / 未归档），失败不产生半成品
    const uniqueLabelIds = input.labels ? [...new Set(input.labels)] : [];
    if (uniqueLabelIds.length > 0) {
      const found = db
        .select()
        .from(issueLabels)
        .where(
          and(eq(issueLabels.workspaceId, WS_ID), inArray(issueLabels.id, uniqueLabelIds)),
        )
        .all();
      if (found.length !== uniqueLabelIds.length) {
        return reply.status(400).send({ success: false, error: '存在无效或不属于本工作区的 labelId'  });
      }
      if (found.some((l) => l.archivedAt != null)) {
        return reply.status(400).send({ success: false, error: '不能挂载已归档的标签'  });
      }
    }

    const result = await createIssueCore({
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status,
      assignee: input.assignee,
      originType: input.originType ?? null,
      originRunId: input.originRunId ?? null,
      originRuleId: input.originRuleId ?? null,
      parentIssueId: input.parentIssueId ?? null,
      stage: input.stage ?? null,
      projectId: input.projectId ?? null,
      customFields: input.customFields ?? null,
      enqueue: true,
    });
    if (!result.ok) {
      return reply.status(result.status).send({ success: false, error: result.error,
        ...(result.code ? { code: result.code } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.issueId ? { issueId: result.issueId } : {}),
      });
    }

    // F2：create 后写 labels（同 handler；校验已前置，写入失败不留半成品）
    if (uniqueLabelIds.length > 0) {
      sqlite.transaction(() => {
        for (const labelId of uniqueLabelIds) {
          db.insert(issueToLabels).values({ issueId: result.issue.id, labelId }).run();
        }
      })();
    }

    // 回显带 labels（toIssue 已带 label 装载，F2）
    const row = db.select().from(issues).where(eq(issues.id, result.issue.id)).get();
    return reply.status(201).send({ ...issueWithLabels(row!), enqueue: result.enqueue });
  });

  // DELETE /api/issues/:id —— 硬删除（学 Multica DeleteIssue：先 cancel active run，再清关联）
  app.delete('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const prev = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!prev) {
      return reply.status(404).send({ success: false, error: 'issue 不存在'  });
    }

    // Multica: CancelTasksForIssue before delete
    cancelActiveRunsForIssue(id);

    const parentIssueId = prev.parentIssueId ?? null;

    sqlite.transaction(() => {
      // 子 issue 仅一层：解除 parent 指向（保留子卡）
      db.update(issues)
        .set({ parentIssueId: null, updatedAt: Date.now() })
        .where(eq(issues.parentIssueId, id))
        .run();

      // cascade 已有：issue_to_label / issue_subscriber
      db.delete(issueToLabels).where(eq(issueToLabels.issueId, id)).run();
      db.delete(issueSubscribers).where(eq(issueSubscribers.issueId, id)).run();
      db.delete(comments).where(eq(comments.issueId, id)).run();
      db.delete(activityLogs).where(eq(activityLogs.issueId, id)).run();
      db.delete(inboxItems).where(eq(inboxItems.issueId, id)).run();
      db.delete(wikiIngestJobs).where(eq(wikiIngestJobs.issueId, id)).run();
      // run 保留审计：issue_id 置空（与 QC 可空 issue 一致）
      db.update(agentRuns)
        .set({ issueId: null })
        .where(eq(agentRuns.issueId, id))
        .run();

      db.delete(issues).where(eq(issues.id, id)).run();
    })();

    eventBus.publish({
      type: 'issue:deleted',
      issueId: id,
      parentIssueId,
    });

    return reply.status(204).send();
  });

  // PUT /api/issues/:id —— status 真变时同事务写 status_change + 双事件
  app.put('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateIssueInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const input = parsed.data;
    if (!validateUpdateIssue(input)) {
      return reply.status(400).send({ success: false, error: '至少传一个字段'  });
    }

    const prev = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!prev) {
      return reply.status(404).send({ success: false, error: 'issue 不存在'  });
    }

    // 动态构造 SET（只更新传入的字段）
    const updates: Partial<typeof issues.$inferInsert> = { updatedAt: Date.now() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.position !== undefined) updates.position = input.position;
    // DS2：跨列改 status 且未显式传 position → 插入目标列顶
    const needsMinPos = input.status !== undefined && input.status !== prev.status && input.position === undefined;
    // assignee 多态指派对（spec §3.5）：放开输入，GET 时服务端填 label
    if (input.assignee !== undefined) {
      updates.assigneeType = input.assignee?.type ?? null;
      updates.assigneeId = input.assignee?.id ?? null;
    }
    if (input.projectId !== undefined) {
      if (input.projectId === null) {
        updates.projectId = null;
      } else {
        const proj = db
          .select()
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, WS_ID)))
          .get();
        if (!proj) {
          return reply.status(400).send({ success: false, error: 'project 不存在'  });
        }
        updates.projectId = input.projectId;
      }
    }
    if (input.prUrl !== undefined) {
      if (input.prUrl === null) {
        updates.prUrl = null;
      } else {
        const trimmed = input.prUrl.trim();
        if (!trimmed) {
          updates.prUrl = null;
        } else {
          updates.prUrl = trimmed;
        }
      }
    }
    if (input.customFields !== undefined) {
      updates.customFields = input.customFields;
    }

    const statusChanged = input.status !== undefined && input.status !== prev.status;

    // Target validation is shared with bulk-assign. It runs before the Issue
    // write so a rejected runtime/squad can never leave a false assignment.
    let assignmentPreflight: AssignmentPreflightSuccess | null = null;
    if (input.assignee !== undefined) {
      const prevKey = assigneeKey(prev.assigneeType, prev.assigneeId);
      const target: AssignmentTarget = input.assignee
        ? { type: input.assignee.type, id: input.assignee.id }
        : null;
      const nextKey = assigneeKey(target?.type ?? null, target?.id ?? null);
      if (prevKey !== nextKey) {
        const preflight = await preflightAssignmentTarget(target);
        if (!preflight.ok) {
          return reply.status(preflight.status).send({
            success: false,
            error: preflight.error,
            ...(preflight.code ? { code: preflight.code } : {}),
            ...(preflight.reason ? { reason: preflight.reason } : {}),
          });
        }
        assignmentPreflight = preflight;
      }
    }

    const expectedUpdatedAt = typeof (req.body as any).expectedUpdatedAt === 'number' ? (req.body as any).expectedUpdatedAt : undefined;

    const run = sqlite.transaction(() => {
      if (needsMinPos && input.status !== undefined) {
        const minRow = db
          .select({ minPos: sql<number>`COALESCE(MIN(${issues.position}), 0) - 1` })
          .from(issues)
          .where(and(eq(issues.workspaceId, WS_ID), eq(issues.status, input.status)))
          .get();
        updates.position = minRow?.minPos ?? -1;
      }

      const condition = expectedUpdatedAt !== undefined
        ? and(eq(issues.id, id), eq(issues.updatedAt, expectedUpdatedAt))
        : and(eq(issues.id, id), eq(issues.status, prev.status));

      const result = db.update(issues).set(updates).where(condition).run();
      if (result.changes === 0) {
        return 'conflict';
      }

      let statusCommentId: string | null = null;
      if (statusChanged && input.status) {
        statusCommentId = crypto.randomUUID();
        db.insert(comments)
          .values({
            id: statusCommentId,
            issueId: id,
            type: 'status_change',
            authorType: 'member',
            authorId: LOCAL_MEMBER.id,
            body: JSON.stringify({ from: prev.status, to: input.status }),
            createdAt: Date.now(),
          })
          .run();
      }
      return statusCommentId;
    });

    const statusCommentId = run();
    if (statusCommentId === 'conflict') {
      return reply.status(409).send({ success: false, error: '更新冲突：工单状态已被修改，请刷新后重试' });
    }

    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    const issue = issueWithLabels(row!);
    eventBus.publish({
      type: 'issue:updated',
      issue,
      statusChanged,
      prevStatus: statusChanged ? prev.status : null,
    });

    if (statusCommentId) {
      const cRow = db.select().from(comments).where(eq(comments.id, statusCommentId)).get();
      eventBus.publish({ type: 'comment:created', comment: toComment(cRow!) });
    }

    // assignee identity 真的变化才派发。单条保留历史的「先取消旧
    // active run，再派新目标」语义；bulk-assign 不会传该取消 hook。
    let enqResult: EnqueueResult | null = null;
    if (assignmentPreflight) {
      enqResult = await dispatchIssueAssignment(
        issue,
        assignmentPreflight,
        () => cancelActiveRunsForIssue(id),
      );
    }

    if (statusChanged && input.status) {
      recordActivityLog({
        issueId: id,
        actorType: 'member',
        actorName: '用户',
        eventType: 'status_changed',
        payload: { from: prev.status, to: input.status },
      });
    }

    if (input.priority !== undefined && input.priority !== prev.priority) {
      recordActivityLog({
        issueId: id,
        actorType: 'member',
        actorName: '用户',
        eventType: 'priority_changed',
        payload: { from: prev.priority, to: input.priority },
      });
    }

    if (assignmentPreflight) {
      recordActivityLog({
        issueId: id,
        actorType: 'member',
        actorName: '用户',
        eventType: 'assignee_changed',
        payload: {
          from: assigneeKey(prev.assigneeType, prev.assigneeId),
          to: assigneeKey(
            assignmentPreflight.target?.type ?? null,
            assignmentPreflight.target?.id ?? null,
          ),
        },
      });
    }

    if (input.customFields !== undefined && JSON.stringify(input.customFields) !== JSON.stringify(prev.customFields)) {
      recordActivityLog({
        issueId: id,
        actorType: 'member',
        actorName: '用户',
        eventType: 'custom_fields_updated',
        payload: { from: prev.customFields, to: input.customFields },
      });
    }

    // S08：Issue 完成 → 入队 wiki ingest（spec B9），不再 fire-and-forget 直调
    // S11：并列 ambient 短记忆（B4 / B6，失败不挡 HTTP）
    if (statusChanged && input.status === 'done') {
      const jobId = enqueueWikiIngest(id);
      if (jobId) wakeWikiIngestWorker();

      const desc = issue.description?.trim()
        ? `\n${issue.description.length > 500 ? issue.description.slice(0, 500) : issue.description}`
        : '';
      memoryManager.ambientCapture({
        kind: 'issue_done',
        issueId: id,
        projectId: issue.projectId ?? null,
        text: `[ambient:issue_done] Issue ${issue.identifier}: ${issue.title}\nStatus → done${desc}`,
      });
    }

    // S2：子任务收口 → 通知并唤醒父级（不改父状态）。失败不挡 HTTP。
    if (statusChanged && input.status) {
      try {
        await propagateChildDoneBatch([
          {
            issueId: id,
            parentIssueId: prev.parentIssueId,
            prevStatus: prev.status,
            nextStatus: input.status,
            // W7：变更子带 stage 时走阶段屏障
            stage: prev.stage,
          },
        ]);
      } catch (e) {
        app.log.warn({ err: e, issueId: id }, 'child-done propagation failed');
      }
    }

    const enqueue = toIssueEnqueueMeta(enqResult);
    return reply.send({ ...issue, enqueue });
  });

  // GET /api/issues/:id/activities —— 查询 Issue 活动日志
  app.get('/api/issues/:id/activities', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issueRow = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issueRow) return reply.status(404).send({ success: false, error: 'issue 不存在'  });

    const rows = db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.issueId, id))
      .orderBy(activityLogs.createdAt)
      .all();

    const items = rows.map((r) => ({
      id: r.id,
      issueId: r.issueId,
      actorType: r.actorType,
      actorId: r.actorId,
      actorName: r.actorName,
      eventType: r.eventType,
      payload: r.payload ? JSON.parse(r.payload) : null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    return reply.send({ activities: items });
  });

  // PUT /api/issues/:id/labels —— 全量替换标签集合
  app.put('/api/issues/:id/labels', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SetIssueLabelsInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const issueRow = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issueRow) return reply.status(404).send({ success: false, error: 'issue 不存在'  });

    const uniqueIds = [...new Set(parsed.data.labelIds)];
    if (uniqueIds.length > 0) {
      const found = db
        .select()
        .from(issueLabels)
        .where(
          and(eq(issueLabels.workspaceId, WS_ID), inArray(issueLabels.id, uniqueIds)),
        )
        .all();
      if (found.length !== uniqueIds.length) {
        return reply.status(400).send({ success: false, error: '存在无效或不属于本工作区的 labelId'  });
      }
      if (found.some((l) => l.archivedAt != null)) {
        return reply.status(400).send({ success: false, error: '不能挂载已归档的标签'  });
      }
    }

    sqlite.transaction(() => {
      db.delete(issueToLabels).where(eq(issueToLabels.issueId, id)).run();
      for (const labelId of uniqueIds) {
        db.insert(issueToLabels).values({ issueId: id, labelId }).run();
      }
      db.update(issues).set({ updatedAt: Date.now() }).where(eq(issues.id, id)).run();
    })();

    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    const issue = issueWithLabels(row!);
    eventBus.publish({
      type: 'issue:updated',
      issue,
      statusChanged: false,
      prevStatus: null,
    });
    return reply.send(issue);
  });

  // POST /api/issues/:id/rerun —— 人工再执行（学 Multica RerunIssue）
  app.post('/api/issues/:id/rerun', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body === undefined || req.body === null ? {} : req.body;
    const parsed = RerunIssueInput.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const res = await rerunIssue(id, {
      sourceRunId: parsed.data.runId,
      forceFresh: parsed.data.forceFresh === true,
    });
    if (!res.ok) return reply.status(res.status).send({ success: false, error: res.error  });
    return reply.status(201).send(res.run);
  });

  // G4：GET /api/issues/:id/run-usage —— 详情侧栏用量摘要
  app.get('/api/issues/:id/run-usage', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issue = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issue) return reply.status(404).send({ success: false, error: 'issue 不存在'  });

    const rows = db.select().from(agentRuns).where(eq(agentRuns.issueId, id)).all();
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    let active = 0;
    let durationSum = 0;
    let durationN = 0;
    let lastRunAtMs: number | null = null;

    for (const r of rows) {
      if (lastRunAtMs == null || r.createdAt > lastRunAtMs) lastRunAtMs = r.createdAt;
      if (r.status === 'completed') {
        completed += 1;
        if (r.startedAt != null && r.finishedAt != null && r.finishedAt >= r.startedAt) {
          durationSum += r.finishedAt - r.startedAt;
          durationN += 1;
        }
      } else if (r.status === 'failed') {
        failed += 1;
      } else if (r.status === 'cancelled') {
        cancelled += 1;
      } else if (
        r.status === 'queued' ||
        r.status === 'waiting_local_directory' ||
        r.status === 'running'
      ) {
        active += 1;
      }
    }

    // DS4：SUM 非空 token 列；Slice 28：按 model 价表估 cost
    let tokensInSum = 0;
    let tokensOutSum = 0;
    let tokensCacheReadSum = 0;
    let tokensCacheWriteSum = 0;
    let tokensInN = 0;
    let tokensOutN = 0;
    let tokensCacheReadN = 0;
    let tokensCacheWriteN = 0;
    let costSum = 0;
    let costedRuns = 0;
    let uncostedRuns = 0;
    const ratesConfig = loadModelRates();
    for (const r of rows) {
      const ti = (r as { tokensInput?: number | null }).tokensInput;
      const to = (r as { tokensOutput?: number | null }).tokensOutput;
      const cr = (r as { tokensCacheRead?: number | null }).tokensCacheRead;
      const cw = (r as { tokensCacheWrite?: number | null }).tokensCacheWrite;
      if (typeof ti === 'number') {
        tokensInSum += ti;
        tokensInN += 1;
      }
      if (typeof to === 'number') {
        tokensOutSum += to;
        tokensOutN += 1;
      }
      if (typeof cr === 'number') {
        tokensCacheReadSum += cr;
        tokensCacheReadN += 1;
      }
      if (typeof cw === 'number') {
        tokensCacheWriteSum += cw;
        tokensCacheWriteN += 1;
      }
      const est = estimateCost({
        model: (r as { model?: string | null }).model,
        tokensInput: ti,
        tokensOutput: to,
        config: ratesConfig,
      });
      if (est.uncosted) {
        if (est.uncostedReason !== 'no_tokens') uncostedRuns += 1;
      } else if (est.costUsd != null) {
        costSum += est.costUsd;
        costedRuns += 1;
      }
    }

    const terminal = completed + failed;
    const usage: IssueRunUsage = {
      issueId: id,
      total: rows.length,
      completed,
      failed,
      cancelled,
      active,
      successRate: terminal > 0 ? completed / terminal : null,
      avgDurationMs: durationN > 0 ? Math.round(durationSum / durationN) : null,
      totalDurationMs: durationN > 0 ? durationSum : null,
      lastRunAt: lastRunAtMs != null ? new Date(lastRunAtMs).toISOString() : null,
      tokensInput: tokensInN > 0 ? tokensInSum : null,
      tokensOutput: tokensOutN > 0 ? tokensOutSum : null,
      tokensCacheRead: tokensCacheReadN > 0 ? tokensCacheReadSum : null,
      tokensCacheWrite: tokensCacheWriteN > 0 ? tokensCacheWriteSum : null,
      costUsd: costedRuns > 0 ? Number(costSum.toFixed(6)) : null,
      uncostedRuns,
      costedRuns,
    };
    return usage;
  });

  // POST /api/issues/bulk-status
  app.post('/api/issues/bulk-status', async (req, reply) => {
    const parsed = BulkUpdateIssueStatusInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const { issueIds, status } = parsed.data;
    const now = Date.now();
    let updatedCount = 0;
    // S2：收集本批次的状态跃迁，事务外统一折叠传播（同一父级只一条评论一个 run）
    const childChanges: ChildStatusChange[] = [];
    sqlite.transaction(() => {
      for (const id of issueIds) {
        const prev = db.select().from(issues).where(eq(issues.id, id)).get();
        if (prev && prev.status !== status) {
          db.update(issues).set({ status, updatedAt: now }).where(eq(issues.id, id)).run();
          updatedCount++;
          recordActivityLog({
            issueId: id,
            actorType: 'member',
            actorName: '用户',
            eventType: 'status_changed',
            payload: { from: prev.status, to: status },
          });
          childChanges.push({
            issueId: id,
            parentIssueId: prev.parentIssueId,
            prevStatus: prev.status,
            nextStatus: status,
          });
        }
      }
    })();

    try {
      await propagateChildDoneBatch(childChanges);
    } catch (e) {
      app.log.warn({ err: e }, 'child-done propagation failed (bulk-status)');
    }

    return { success: true, updatedCount };
  });

  // POST /api/issues/bulk-assign
  app.post('/api/issues/bulk-assign', async (req, reply) => {
    const parsed = BulkUpdateIssueAssigneeInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const { issueIds, assigneeType, assigneeId } = parsed.data;
    const target: AssignmentTarget =
      assigneeType && assigneeId ? { type: assigneeType, id: assigneeId } : null;

    // Entire target is checked before opening the write transaction. A bad
    // agent, leader-less squad, or readiness hard gate therefore cannot leave
    // even one Issue/activity row half-updated.
    const preflight = await preflightAssignmentTarget(target);
    if (!preflight.ok) {
      return reply.status(preflight.status).send({
        success: false,
        error: preflight.error,
        ...(preflight.code ? { code: preflight.code } : {}),
        ...(preflight.reason ? { reason: preflight.reason } : {}),
      });
    }

    const now = Date.now();
    const nextKey = assigneeKey(target?.type ?? null, target?.id ?? null);
    const changedRows: (typeof issues.$inferSelect)[] = [];
    sqlite.transaction(() => {
      for (const id of issueIds) {
        const prev = db.select().from(issues).where(eq(issues.id, id)).get();
        if (prev) {
          const prevKey = assigneeKey(prev.assigneeType, prev.assigneeId);
          if (prevKey !== nextKey) {
            db.update(issues)
              .set({
                assigneeType: target?.type ?? null,
                assigneeId: target?.id ?? null,
                updatedAt: now,
              })
              .where(eq(issues.id, id))
              .run();
            recordActivityLog({
              issueId: id,
              actorType: 'member',
              actorName: '用户',
              eventType: 'assignee_changed',
              payload: { from: prevKey, to: nextKey },
            });
            const changed = db.select().from(issues).where(eq(issues.id, id)).get();
            if (changed) changedRows.push(changed);
          }
        }
      }
    })();

    let enqueuedCount = 0;
    let notApplicableCount = 0;
    const results: Array<{ issueId: string; enqueue: IssueEnqueueMeta }> = [];
    const skipped: Array<{
      issueId: string;
      reason: EnqueueSkipReason;
      detail: string | null;
    }> = [];

    // The durable assignment/activity writes are complete. Each actual change
    // now gets its observable issue event and its own dispatch decision. No
    // cancellation hook is supplied here: pre-existing active runs survive
    // bulk reassignment by design.
    for (const row of changedRows) {
      const issue = issueWithLabels(row);
      eventBus.publish({
        type: 'issue:updated',
        issue,
        statusChanged: false,
        prevStatus: null,
      });

      const enqueue = toIssueEnqueueMeta(
        await dispatchIssueAssignment(issue, preflight),
      );
      results.push({ issueId: issue.id, enqueue });
      if (enqueue.status === 'queued') {
        enqueuedCount += 1;
      } else if (enqueue.status === 'skipped') {
        skipped.push({
          issueId: issue.id,
          reason: enqueue.reason ?? 'readiness_error',
          detail: enqueue.detail ?? null,
        });
      } else {
        notApplicableCount += 1;
      }
    }

    return {
      success: true as const,
      updatedCount: changedRows.length,
      enqueuedCount,
      skippedCount: skipped.length,
      notApplicableCount,
      results,
      skipped,
    };
  });

  // POST /api/issues/bulk-delete
  app.post('/api/issues/bulk-delete', async (req, reply) => {
    const parsed = BulkDeleteIssuesInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const { issueIds } = parsed.data;
    let deletedCount = 0;
    sqlite.transaction(() => {
      for (const id of issueIds) {
        const prev = db.select().from(issues).where(eq(issues.id, id)).get();
        if (prev) {
          cancelActiveRunsForIssue(id);
          db.update(issues).set({ parentIssueId: null, updatedAt: Date.now() }).where(eq(issues.parentIssueId, id)).run();
          db.delete(issueToLabels).where(eq(issueToLabels.issueId, id)).run();
          db.delete(issueSubscribers).where(eq(issueSubscribers.issueId, id)).run();
          db.delete(comments).where(eq(comments.issueId, id)).run();
          db.delete(activityLogs).where(eq(activityLogs.issueId, id)).run();
          db.delete(inboxItems).where(eq(inboxItems.issueId, id)).run();
          db.delete(wikiIngestJobs).where(eq(wikiIngestJobs.issueId, id)).run();
          db.update(agentRuns).set({ issueId: null }).where(eq(agentRuns.issueId, id)).run();
          db.delete(issues).where(eq(issues.id, id)).run();
          deletedCount++;
        }
      }
    })();
    return { success: true, deletedCount };
  });

  // —— G5-7：Issue/看板 JSON 导入导出（迁移场景；identifier/position 不导出，导入重新生成） ——

  // GET /api/issues/export?projectId= —— 看板快照导出（全 workspace 或单项目）
  app.get('/api/issues/export', async (req) => {
    const { projectId } = req.query as { projectId?: string };
    const cond = projectId ? and(eq(issues.workspaceId, WS_ID), eq(issues.projectId, projectId)) : eq(issues.workspaceId, WS_ID);
    const rows = db.select().from(issues).where(cond).all();
    const labelMap = loadLabelsByIssueIds(rows.map((r) => r.id));
    const issuesOut = rows.map((r) => {
      const labels = (labelMap.get(r.id) ?? []).map((l) => l.id);
      return {
        title: r.title,
        description: r.description ?? null,
        priority: r.priority,
        status: r.status,
        assignee: r.assigneeType && r.assigneeId ? { type: r.assigneeType, id: r.assigneeId } : null,
        labels,
        projectId: r.projectId ?? null,
        customFields: r.customFields ?? null,
        stage: r.stage ?? undefined,
      };
    });
    const snapshot: IssueExportV1 = {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaceId: WS_ID,
      issues: issuesOut,
    };
    return snapshot;
  });

  // POST /api/issues/import —— 快照导入（静默不 enqueue；逐条 createIssueCore + labels）
  app.post('/api/issues/import', async (req, reply) => {
    const parsed = IssueImportInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const created: string[] = [];
    const failed: { title: string; error: string }[] = [];
    for (const item of parsed.data.issues) {
      try {
        // labels 校验（照 create handler：存在/未归档），失败该条跳过
        const labelIds = item.labels ? [...new Set(item.labels)] : [];
        if (labelIds.length > 0) {
          const found = db
            .select()
            .from(issueLabels)
            .where(and(eq(issueLabels.workspaceId, WS_ID), inArray(issueLabels.id, labelIds)))
            .all();
          if (found.length !== labelIds.length) {
            failed.push({ title: item.title, error: '存在无效 labelId' });
            continue;
          }
          if (found.some((l) => l.archivedAt != null)) {
            failed.push({ title: item.title, error: '不能挂载已归档的标签' });
            continue;
          }
        }
        const result = await createIssueCore({
          title: item.title,
          description: item.description ?? null,
          priority: item.priority ?? 'none',
          status: item.status ?? 'backlog',
          assignee: item.assignee ?? null,
          projectId: item.projectId ?? null,
          customFields: item.customFields ?? null,
          stage: item.stage ?? null,
          enqueue: false, // 迁移场景静默建卡，不触发 run
        });
        if (!result.ok) {
          failed.push({ title: item.title, error: result.error });
          continue;
        }
        if (labelIds.length > 0) {
          sqlite.transaction(() => {
            for (const labelId of labelIds) {
              db.insert(issueToLabels).values({ issueId: result.issue.id, labelId }).run();
            }
          })();
        }
        created.push(result.issue.id);
      } catch (e) {
        failed.push({ title: item.title, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { ok: true, created: created.length, failed };
  });
}

// assignee identity 归一化为 "type:id" 串，用于检测是否真变化（spec §6.1）。
// 仅 label 变化时 key 不变 → 不触发 run 副作用。
function assigneeKey(t: string | null, id: string | null): string {
  return t && id ? `${t}:${id}` : '';
}

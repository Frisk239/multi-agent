import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  CreateIssueInput,
  UpdateIssueInput,
  RerunIssueInput,
  SetIssueLabelsInput,
  ListIssuesQuery,
  validateUpdateIssue,
  type IssueRunUsage,
} from '@ma/shared';
import { db, sqlite } from '../db/client.js';
import {
  issues,
  comments,
  issueLabels,
  issueToLabels,
  agentRuns,
  inboxItems,
  issueSubscribers,
  wikiIngestJobs,
} from '../db/schema.js';
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
import { wakeWikiIngestWorker } from '../wiki/ingest-worker.js';
import { memoryManager } from '../memory/manager.js';
import { createIssueCore } from '../orchestration/issue-create.js';

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
      return reply.status(400).send({ error: parsed.error.flatten() });
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
    } = parsed.data;
    const qTrim = q?.trim() ?? '';
    const unassignedOn = unassigned === '1' || unassigned === 'true';
    const assignedOn = assigned === '1' || assigned === 'true';

    let rows = db
      .select()
      .from(issues)
      .where(eq(issues.workspaceId, WS_ID))
      .orderBy(issues.position, sql`created_at DESC`)
      .all();

    if (status) {
      rows = rows.filter((r) => r.status === status);
    }

    if (priority) {
      rows = rows.filter((r) => r.priority === priority);
    }

    if (originType) {
      rows = rows.filter((r) => r.originType === originType);
    }

    if (projectId) {
      rows = rows.filter((r) => r.projectId === projectId);
    }

    if (labelId) {
      const lab = db
        .select()
        .from(issueLabels)
        .where(and(eq(issueLabels.id, labelId), eq(issueLabels.workspaceId, WS_ID)))
        .get();
      if (!lab || lab.archivedAt != null) {
        return reply.status(400).send({ error: 'labelId 无效或已归档' });
      }
      const linked = new Set(
        db
          .select()
          .from(issueToLabels)
          .where(eq(issueToLabels.labelId, labelId))
          .all()
          .map((j) => j.issueId),
      );
      rows = rows.filter((r) => linked.has(r.id));
    }

    if (qTrim) {
      const needle = qTrim.toLowerCase();
      rows = rows.filter((r) => {
        if (r.identifier.toLowerCase().includes(needle)) return true;
        if (r.title.toLowerCase().includes(needle)) return true;
        if ((r.description ?? '').toLowerCase().includes(needle)) return true;
        return false;
      });
    }

    if (unassignedOn) {
      rows = rows.filter((r) => r.assigneeType == null || r.assigneeId == null);
    } else if (assigneeType && assigneeId) {
      rows = rows.filter(
        (r) => r.assigneeType === assigneeType && r.assigneeId === assigneeId,
      );
    } else if (assignedOn) {
      // 「我的 issue」/已指派：任一 agent 或 squad（忽略 member 等）
      rows = rows.filter(
        (r) => r.assigneeType === 'agent' || r.assigneeType === 'squad',
      );
    }

    return issuesWithRelations(rows);
  });

  // GET /api/issues/:id —— 与 list 共用 toIssue（R6）
  app.get('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!row) return reply.status(404).send({ error: 'issue 不存在' });
    return issueWithLabels(row);
  });

  // GET /api/issues/:id/children —— 子 issue 列表（创建序）
  app.get('/api/issues/:id/children', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parent = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!parent) return reply.status(404).send({ error: 'issue 不存在' });
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
    if (!row) return reply.status(404).send({ error: 'issue 不存在' });
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
    if (!row) return reply.status(404).send({ error: 'issue 不存在' });
    ensureIssueSubscriber(id, 'member', LOCAL_MEMBER.id, 'manual');
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
    if (!row) return reply.status(404).send({ error: 'issue 不存在' });
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
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const result = createIssueCore({
      title: input.title,
      description: input.description,
      priority: input.priority,
      assignee: input.assignee,
      originType: input.originType ?? null,
      originRunId: input.originRunId ?? null,
      originRuleId: input.originRuleId ?? null,
      parentIssueId: input.parentIssueId ?? null,
      projectId: input.projectId ?? null,
      enqueue: true,
    });
    if (!result.ok) {
      return reply.status(result.status).send({
        error: result.error,
        ...(result.issueId ? { issueId: result.issueId } : {}),
      });
    }
    return reply.status(201).send(result.issue);
  });

  // DELETE /api/issues/:id —— 硬删除（学 Multica DeleteIssue：先 cancel active run，再清关联）
  app.delete('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const prev = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!prev) {
      return reply.status(404).send({ error: 'issue 不存在' });
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
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    if (!validateUpdateIssue(input)) {
      return reply.status(400).send({ error: '至少传一个字段' });
    }

    const prev = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!prev) {
      return reply.status(404).send({ error: 'issue 不存在' });
    }

    // 动态构造 SET（只更新传入的字段）
    const updates: Partial<typeof issues.$inferInsert> = { updatedAt: Date.now() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.position !== undefined) updates.position = input.position;
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
          return reply.status(400).send({ error: 'project 不存在' });
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
        } else if (!/^https?:\/\//i.test(trimmed)) {
          return reply.status(400).send({ error: 'prUrl 须为 http(s) URL' });
        } else {
          updates.prUrl = trimmed;
        }
      }
    }

    const statusChanged = input.status !== undefined && input.status !== prev.status;

    const run = sqlite.transaction(() => {
      db.update(issues).set(updates).where(eq(issues.id, id)).run();

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

    // assignee 副作用（spec §6.1）：identity=(type,id) 变化才触发。
    // 仅 label 变化不触发。→ cancelActiveRunsForIssue + 按 type 路由 enqueue。
    // S04：squad 指派 → 解析 leader → enqueueLeaderRun（spec §5.1）
    if (input.assignee !== undefined) {
      const prevKey = assigneeKey(prev.assigneeType, prev.assigneeId);
      const nextType = input.assignee?.type ?? null;
      const nextId = input.assignee?.id ?? null;
      const nextKey = assigneeKey(nextType, nextId);
      if (prevKey !== nextKey) {
        // bu01：指派变更 → subscriber + assigned inbox
        if (nextType && nextId) {
          notifyAssigned(issue);
        } else {
          ensureIssueSubscriber(id, 'member', LOCAL_MEMBER.id, 'assignee_watch');
        }
        cancelActiveRunsForIssue(id);
        if (nextType === 'agent' && nextId) {
          enqueueAgentRun(id, nextId);
        } else if (nextType === 'squad' && nextId) {
          const squad = loadSquadDetail(nextId);
          if (squad?.leaderId) {
            enqueueLeaderRun(id, squad.leaderId, squad.id);
          }
        }
      }
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
        text: `[ambient:issue_done] Issue ${issue.identifier}: ${issue.title}\nStatus → done${desc}`,
      });
    }

    return reply.send(issue);
  });

  // PUT /api/issues/:id/labels —— 全量替换标签集合
  app.put('/api/issues/:id/labels', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SetIssueLabelsInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const issueRow = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issueRow) return reply.status(404).send({ error: 'issue 不存在' });

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
        return reply.status(400).send({ error: '存在无效或不属于本工作区的 labelId' });
      }
      if (found.some((l) => l.archivedAt != null)) {
        return reply.status(400).send({ error: '不能挂载已归档的标签' });
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
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const res = rerunIssue(id, parsed.data.runId);
    if (!res.ok) return reply.status(res.status).send({ error: res.error });
    return reply.status(201).send(res.run);
  });

  // G4：GET /api/issues/:id/run-usage —— 详情侧栏用量摘要
  app.get('/api/issues/:id/run-usage', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issue = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issue) return reply.status(404).send({ error: 'issue 不存在' });

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
      } else if (r.status === 'queued' || r.status === 'running') {
        active += 1;
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
      tokensInput: null,
      tokensOutput: null,
      tokensCacheRead: null,
      tokensCacheWrite: null,
    };
    return usage;
  });
}

// assignee identity 归一化为 "type:id" 串，用于检测是否真变化（spec §6.1）。
// 仅 label 变化时 key 不变 → 不触发 run 副作用。
function assigneeKey(t: string | null, id: string | null): string {
  return t && id ? `${t}:${id}` : '';
}

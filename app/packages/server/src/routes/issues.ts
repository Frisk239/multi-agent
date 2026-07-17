import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import {
  CreateIssueInput,
  UpdateIssueInput,
  RerunIssueInput,
  validateUpdateIssue,
} from '@ma/shared';
import { db, sqlite } from '../db/client.js';
import { issues, comments } from '../db/schema.js';
import { toIssue, toComment } from '../db/reshape.js';
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
  notifyAssigned,
} from '../orchestration/inbox-writer.js';
import { enqueueWikiIngest } from '../wiki/ingest-queue.js';
import { wakeWikiIngestWorker } from '../wiki/ingest-worker.js';
import { memoryManager } from '../memory/manager.js';
import { createIssueCore } from '../orchestration/issue-create.js';

const WS_ID = 'ws-local';

export async function issueRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/issues —— spec §5.1，扁平数组，按 position ASC, created_at DESC
  app.get('/api/issues', async () => {
    const rows = db
      .select()
      .from(issues)
      .where(eq(issues.workspaceId, WS_ID))
      .orderBy(issues.position, sql`created_at DESC`)
      .all();
    return rows.map(toIssue);
  });

  // GET /api/issues/:id —— 与 list 共用 toIssue（R6）
  app.get('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!row) return reply.status(404).send({ error: 'issue 不存在' });
    return toIssue(row);
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
    const issue = toIssue(row!);
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
}

// assignee identity 归一化为 "type:id" 串，用于检测是否真变化（spec §6.1）。
// 仅 label 变化时 key 不变 → 不触发 run 副作用。
function assigneeKey(t: string | null, id: string | null): string {
  return t && id ? `${t}:${id}` : '';
}

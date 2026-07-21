import type { FastifyInstance } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { CreateCommentInput } from '@ma/shared';
import { db } from '../db/client.js';
import { comments, issues } from '../db/schema.js';
import { toComment, toIssue } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';
import { triggerFromComment } from '../orchestration/comment-trigger.js';
import { notifyCommentCreated } from '../orchestration/inbox-writer.js';
import { LOCAL_MEMBER } from '../local-member.js';
import { memoryManager } from '../memory/manager.js';

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/issues/:id/comments — R3: created_at ASC, id ASC
  app.get('/api/issues/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issue = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issue) return reply.status(404).send({ error: 'issue 不存在' });

    const rows = db
      .select()
      .from(comments)
      .where(eq(comments.issueId, id))
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .all();
    return rows.map(toComment);
  });

  // POST /api/issues/:id/comments
  app.post('/api/issues/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issue = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issue) return reply.status(404).send({ error: 'issue 不存在' });

    const parsed = CreateCommentInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const commentId = crypto.randomUUID();
    const now = Date.now();
    db.insert(comments)
      .values({
        id: commentId,
        issueId: id,
        type: 'comment',
        authorType: 'member',
        authorId: LOCAL_MEMBER.id,
        body: parsed.data.body,
        createdAt: now,
      })
      .run();

    const row = db.select().from(comments).where(eq(comments.id, commentId)).get();
    const comment = toComment(row!);
    eventBus.publish({ type: 'comment:created', comment });
    // S04 + mention-visibility：解析 mention 派任务并写系统总结 comment
    const dispatches = await triggerFromComment(comment, { announce: true });

    // bu01：普通评论写真 Inbox（status_change 在 writer 内过滤）
    notifyCommentCreated(comment, toIssue(issue));

    // S11：member 普通评论 → ambient 记忆（不含 status_change）
    if (comment.type === 'comment' && comment.authorType === 'member') {
      const issueRow = db.select().from(issues).where(eq(issues.id, id)).get();
      const ident = issueRow?.identifier ?? id;
      const title = issueRow?.title ?? '';
      const body =
        comment.body.length > 1500
          ? comment.body.slice(0, 1500)
          : comment.body;
      memoryManager.ambientCapture({
        kind: 'comment',
        issueId: id,
        text: `[ambient:comment] Issue ${ident}: ${title}\n${body}`,
      });
    }

    // 201 仍以用户 comment 为主 body；dispatches 供前端 toast / 联调
    return reply.status(201).send({ ...comment, dispatches });
  });
}

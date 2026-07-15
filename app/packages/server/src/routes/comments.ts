import type { FastifyInstance } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { CreateCommentInput } from '@ma/shared';
import { db } from '../db/client.js';
import { comments, issues } from '../db/schema.js';
import { toComment } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';
import { triggerFromComment } from '../orchestration/comment-trigger.js';
import { LOCAL_MEMBER } from '../local-member.js';

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
    // S04：comment-trigger 解析 mention 派任务（spec §7.3 入口1）
    triggerFromComment(comment);
    return reply.status(201).send(comment);
  });
}

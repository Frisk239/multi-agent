import type { FastifyInstance } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { CreateCommentInput, ResolveThreadInput } from '@ma/shared';
import { isRootComment, validateResolve } from '../comment-thread.js';
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
    if (!issue) return reply.status(404).send({ success: false, error: 'issue 不存在'  });

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
    if (!issue) return reply.status(404).send({ success: false, error: 'issue 不存在'  });

    const parsed = CreateCommentInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    // S3：回复必须挂在同 issue 的根评论上（仅一层）
    const parentCommentId = parsed.data.parentCommentId ?? null;
    if (parentCommentId) {
      const parent = db
        .select()
        .from(comments)
        .where(eq(comments.id, parentCommentId))
        .get();
      if (!parent || parent.issueId !== id) {
        return reply
          .status(400)
          .send({ success: false, code: 'PARENT_NOT_FOUND', error: '父评论不存在于该 issue' });
      }
      if (!isRootComment({ id: parent.id, parentCommentId: parent.parentCommentId, createdAt: parent.createdAt, body: parent.body })) {
        return reply.status(400).send({
          success: false,
          code: 'THREAD_TOO_DEEP',
          error: '只支持根评论下一层回复',
        });
      }
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
        parentCommentId,
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

  /**
   * S3：POST /api/comments/:commentId/resolve —— 把某条回复标为该线程结论。
   * 幂等：重复 resolve 同一结论返回 200 且状态不变；换结论则替换（每线程恒一个）。
   */
  app.post('/api/comments/:commentId/resolve', async (req, reply) => {
    const { commentId } = req.params as { commentId: string };
    const parsed = ResolveThreadInput.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }

    const root = db.select().from(comments).where(eq(comments.id, commentId)).get();
    if (!root) return reply.status(404).send({ success: false, error: '评论不存在' });

    const replies = db
      .select()
      .from(comments)
      .where(eq(comments.parentCommentId, commentId))
      .all();

    const check = validateResolve(root, replies, parsed.data.resolutionCommentId ?? null);
    if (!check.ok) {
      return reply.status(400).send({ success: false, code: check.code, error: check.message });
    }

    const alreadySame =
      root.resolvedAt != null && root.resolutionCommentId === check.resolutionCommentId;
    if (!alreadySame) {
      db.update(comments)
        .set({
          resolvedAt: root.resolvedAt ?? Date.now(),
          resolutionCommentId: check.resolutionCommentId,
        })
        .where(eq(comments.id, commentId))
        .run();
    }

    const updated = db.select().from(comments).where(eq(comments.id, commentId)).get()!;
    const out = toComment(updated);
    eventBus.publish({ type: 'comment:created', comment: out });
    return reply.send({ success: true, comment: out, idempotent: alreadySame });
  });

  /** S3：POST /api/comments/:commentId/unresolve —— 撤销定论。幂等。 */
  app.post('/api/comments/:commentId/unresolve', async (req, reply) => {
    const { commentId } = req.params as { commentId: string };
    const root = db.select().from(comments).where(eq(comments.id, commentId)).get();
    if (!root) return reply.status(404).send({ success: false, error: '评论不存在' });

    const wasResolved = root.resolvedAt != null;
    if (wasResolved) {
      db.update(comments)
        .set({ resolvedAt: null, resolutionCommentId: null })
        .where(eq(comments.id, commentId))
        .run();
    }

    const updated = db.select().from(comments).where(eq(comments.id, commentId)).get()!;
    const out = toComment(updated);
    eventBus.publish({ type: 'comment:created', comment: out });
    return reply.send({ success: true, comment: out, idempotent: !wasResolved });
  });
}

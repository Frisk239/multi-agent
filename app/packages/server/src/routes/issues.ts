import type { FastifyInstance } from 'fastify';
import { eq, sql, and } from 'drizzle-orm';
import { CreateIssueInput, UpdateIssueInput, validateUpdateIssue } from '@ma/shared';
import { db } from '../db/client.js';
import { issues } from '../db/schema.js';
import { toIssue } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';

const WS_ID = 'ws-local';
const USER_ID = 'user-linyuan';

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

  // POST /api/issues —— spec §5.2
  app.post('/api/issues', async (req, reply) => {
    const parsed = CreateIssueInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const now = Date.now();

    // identifier 生成：MAX(SUBSTR(identifier,4))+1
    const maxRow = db
      .select({ maxNum: sql<number>`MAX(CAST(SUBSTR(${issues.identifier}, 4) AS INTEGER))` })
      .from(issues)
      .where(eq(issues.workspaceId, WS_ID))
      .get();
    const nextNum = (maxRow?.maxNum ?? 0) + 1;
    const identifier = `FRI-${nextNum}`;

    // position 浮顶：MIN(position)-1（spec §5.2 + R3）
    const minRow = db
      .select({ minPos: sql<number>`COALESCE(MIN(${issues.position}), 0) - 1` })
      .from(issues)
      .where(and(eq(issues.workspaceId, WS_ID), eq(issues.status, 'backlog')))
      .get();
    const position = minRow?.minPos ?? -1;

    const id = crypto.randomUUID();
    db.insert(issues)
      .values({
        id,
        workspaceId: WS_ID,
        identifier,
        title: input.title,
        description: input.description ?? null,
        status: 'backlog',
        priority: input.priority,
        assigneeType: input.assignee?.type ?? null,
        assigneeId: input.assignee?.id ?? null,
        creatorType: 'member',
        creatorId: USER_ID,
        position,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    const issue = toIssue(row!);
    eventBus.publish({ type: 'issue:created', issue });
    return reply.status(201).send(issue);
  });

  // PUT /api/issues/:id —— spec §5.3，不加条件守卫（D2）
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

    db.update(issues).set(updates).where(eq(issues.id, id)).run();

    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    const issue = toIssue(row!);
    const statusChanged = input.status !== undefined && input.status !== prev.status;
    eventBus.publish({
      type: 'issue:updated',
      issue,
      statusChanged,
      prevStatus: statusChanged ? prev.status : null,
    });
    return reply.send(issue);
  });
}

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { CreateIssueLabelInput, UpdateIssueLabelInput } from '@ma/shared';
import { db } from '../db/client.js';
import { issueLabels } from '../db/schema.js';
import { toIssueLabel } from '../db/reshape.js';

const WS_ID = 'ws-local';
const DEFAULT_COLOR = '#6b7280';

export async function labelRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/labels —— 工作区标签目录
  app.get('/api/labels', async () => {
    const rows = db
      .select()
      .from(issueLabels)
      .where(eq(issueLabels.workspaceId, WS_ID))
      .all();
    return rows
      .map(toIssueLabel)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  });

  // POST /api/labels
  app.post('/api/labels', async (req, reply) => {
    const parsed = CreateIssueLabelInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const name = parsed.data.name.trim();
    if (!name) return reply.status(400).send({ error: 'name 不能为空' });
    const color = parsed.data.color ?? DEFAULT_COLOR;
    const now = Date.now();
    const id = crypto.randomUUID();

    const dup = db
      .select()
      .from(issueLabels)
      .where(and(eq(issueLabels.workspaceId, WS_ID), eq(issueLabels.name, name)))
      .get();
    if (dup) return reply.status(409).send({ error: '同名标签已存在' });

    db.insert(issueLabels)
      .values({
        id,
        workspaceId: WS_ID,
        name,
        color,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const row = db.select().from(issueLabels).where(eq(issueLabels.id, id)).get();
    return reply.status(201).send(toIssueLabel(row!));
  });

  // PUT /api/labels/:id
  app.put('/api/labels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateIssueLabelInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const prev = db.select().from(issueLabels).where(eq(issueLabels.id, id)).get();
    if (!prev || prev.workspaceId !== WS_ID) {
      return reply.status(404).send({ error: 'label 不存在' });
    }

    const name = parsed.data.name?.trim();
    if (name !== undefined && !name) {
      return reply.status(400).send({ error: 'name 不能为空' });
    }
    if (name && name !== prev.name) {
      const dup = db
        .select()
        .from(issueLabels)
        .where(and(eq(issueLabels.workspaceId, WS_ID), eq(issueLabels.name, name)))
        .get();
      if (dup) return reply.status(409).send({ error: '同名标签已存在' });
    }

    db.update(issueLabels)
      .set({
        name: name ?? prev.name,
        color: parsed.data.color ?? prev.color,
        updatedAt: Date.now(),
      })
      .where(eq(issueLabels.id, id))
      .run();
    const row = db.select().from(issueLabels).where(eq(issueLabels.id, id)).get();
    return toIssueLabel(row!);
  });

  // DELETE /api/labels/:id —— cascade junction via FK
  app.delete('/api/labels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const prev = db.select().from(issueLabels).where(eq(issueLabels.id, id)).get();
    if (!prev || prev.workspaceId !== WS_ID) {
      return reply.status(404).send({ error: 'label 不存在' });
    }
    db.delete(issueLabels).where(eq(issueLabels.id, id)).run();
    return reply.status(204).send();
  });
}

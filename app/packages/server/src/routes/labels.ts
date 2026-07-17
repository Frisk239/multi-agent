import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { CreateIssueLabelInput, UpdateIssueLabelInput } from '@ma/shared';
import { db, sqlite } from '../db/client.js';
import { issueLabels, issueToLabels } from '../db/schema.js';
import { toIssueLabel } from '../db/reshape.js';

const WS_ID = 'ws-local';
const DEFAULT_COLOR = '#6b7280';

function includeArchivedFlag(q: unknown): boolean {
  if (!q || typeof q !== 'object') return false;
  const v = (q as { includeArchived?: string }).includeArchived;
  return v === '1' || v === 'true';
}

export async function labelRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/labels —— 默认仅活跃；?includeArchived=1 含归档
  app.get('/api/labels', async (req) => {
    const includeArchived = includeArchivedFlag(req.query);
    const rows = includeArchived
      ? db.select().from(issueLabels).where(eq(issueLabels.workspaceId, WS_ID)).all()
      : db
          .select()
          .from(issueLabels)
          .where(and(eq(issueLabels.workspaceId, WS_ID), isNull(issueLabels.archivedAt)))
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

    // 同名含已归档也冲突（唯一索引 workspace+name）
    const dup = db
      .select()
      .from(issueLabels)
      .where(and(eq(issueLabels.workspaceId, WS_ID), eq(issueLabels.name, name)))
      .get();
    if (dup) {
      if (dup.archivedAt != null) {
        return reply.status(409).send({ error: '同名标签已归档，请换名或恢复（本刀无 unarchive UI）' });
      }
      return reply.status(409).send({ error: '同名标签已存在' });
    }

    db.insert(issueLabels)
      .values({
        id,
        workspaceId: WS_ID,
        name,
        color,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const row = db.select().from(issueLabels).where(eq(issueLabels.id, id)).get();
    return reply.status(201).send(toIssueLabel(row!));
  });

  // PUT /api/labels/:id —— 仅活跃可改名/色
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
    if (prev.archivedAt != null) {
      return reply.status(400).send({ error: '已归档标签不可编辑' });
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

  // DELETE /api/labels/:id —— 软归档 + 清 junction（issue-find）
  app.delete('/api/labels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const prev = db.select().from(issueLabels).where(eq(issueLabels.id, id)).get();
    if (!prev || prev.workspaceId !== WS_ID) {
      return reply.status(404).send({ error: 'label 不存在' });
    }
    if (prev.archivedAt != null) {
      return reply.status(204).send();
    }
    const now = Date.now();
    sqlite.transaction(() => {
      db.delete(issueToLabels).where(eq(issueToLabels.labelId, id)).run();
      db.update(issueLabels)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(issueLabels.id, id))
        .run();
    })();
    return reply.status(204).send();
  });
}

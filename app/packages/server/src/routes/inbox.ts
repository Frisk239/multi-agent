import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  ArchiveInboxManyInput,
  MarkInboxReadManyInput,
} from '@ma/shared';
import { db } from '../db/client.js';
import { inboxItems, issues } from '../db/schema.js';
import { toInboxItem } from '../db/reshape.js';
import { LOCAL_MEMBER } from '../local-member.js';

const DEFAULT_LIMIT = 50;
const RECIPIENT_TYPE = 'member' as const;

function recipientFilter() {
  return and(
    eq(inboxItems.recipientType, RECIPIENT_TYPE),
    eq(inboxItems.recipientId, LOCAL_MEMBER.id),
  );
}

function parseLimit(raw: string | undefined): number {
  const parsed = raw != null ? Number(raw) : DEFAULT_LIMIT;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), 200);
}

function loadIssueMeta(issueIds: string[]): Map<string, { identifier: string; title: string }> {
  const map = new Map<string, { identifier: string; title: string }>();
  if (issueIds.length === 0) return map;
  // 小批量：逐 id 取即可（inbox limit ≤ 200）
  for (const id of issueIds) {
    const row = db
      .select({ id: issues.id, identifier: issues.identifier, title: issues.title })
      .from(issues)
      .where(eq(issues.id, id))
      .get();
    if (row) map.set(row.id, { identifier: row.identifier, title: row.title });
  }
  return map;
}

function unreadCountForRecipient(): number {
  const row = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(inboxItems)
    .where(
      and(recipientFilter(), eq(inboxItems.read, 0), eq(inboxItems.archived, 0)),
    )
    .get();
  return row?.cnt ?? 0;
}

// bu01：真表 Inbox — list / read / archive / unread-count
export async function inboxRoutes(app: FastifyInstance): Promise<void> {
  // 轻量角标接口（须注册在 /:id 之前）
  app.get('/api/inbox/unread-count', async () => {
    return { count: unreadCountForRecipient() };
  });

  app.get('/api/inbox', async (req) => {
    const q = req.query as { limit?: string; includeArchived?: string };
    const limit = parseLimit(q.limit);
    const includeArchived =
      q.includeArchived === '1' || q.includeArchived === 'true';

    const where = includeArchived
      ? recipientFilter()
      : and(recipientFilter(), eq(inboxItems.archived, 0));

    const rows = db
      .select()
      .from(inboxItems)
      .where(where)
      .orderBy(desc(inboxItems.createdAt))
      .limit(limit)
      .all();

    const issueIds = [
      ...new Set(rows.map((r) => r.issueId).filter((id): id is string => !!id)),
    ];
    const meta = loadIssueMeta(issueIds);
    const items = rows.map((r) =>
      toInboxItem(r, r.issueId ? meta.get(r.issueId) : undefined),
    );

    return {
      items,
      unreadCount: unreadCountForRecipient(),
    };
  });

  // 批量已读（须在 /:id 之前注册）
  app.post('/api/inbox/read-many', async (req, reply) => {
    const parsed = MarkInboxReadManyInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid body', details: parsed.error.flatten() });
    }
    const ids = [...new Set(parsed.data.ids)];
    const result = db
      .update(inboxItems)
      .set({ read: 1 })
      .where(and(recipientFilter(), inArray(inboxItems.id, ids), eq(inboxItems.read, 0)))
      .run();
    return {
      requested: ids.length,
      updated: result.changes ?? 0,
      unreadCount: unreadCountForRecipient(),
    };
  });

  // 批量归档
  app.post('/api/inbox/archive-many', async (req, reply) => {
    const parsed = ArchiveInboxManyInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid body', details: parsed.error.flatten() });
    }
    const ids = [...new Set(parsed.data.ids)];
    const result = db
      .update(inboxItems)
      .set({ archived: 1, read: 1 })
      .where(
        and(recipientFilter(), inArray(inboxItems.id, ids), eq(inboxItems.archived, 0)),
      )
      .run();
    return {
      requested: ids.length,
      updated: result.changes ?? 0,
      unreadCount: unreadCountForRecipient(),
    };
  });

  app.post('/api/inbox/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = db
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.id, id), recipientFilter()))
      .get();
    if (!existing) return reply.status(404).send({ error: 'inbox item 不存在' });

    db.update(inboxItems)
      .set({ read: 1 })
      .where(and(eq(inboxItems.id, id), recipientFilter()))
      .run();

    const row = db.select().from(inboxItems).where(eq(inboxItems.id, id)).get()!;
    let issueMeta: { identifier: string; title: string } | undefined;
    if (row.issueId) {
      const iss = db.select().from(issues).where(eq(issues.id, row.issueId)).get();
      if (iss) issueMeta = { identifier: iss.identifier, title: iss.title };
    }
    return toInboxItem(row, issueMeta);
  });

  app.post('/api/inbox/:id/archive', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = db
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.id, id), recipientFilter()))
      .get();
    if (!existing) return reply.status(404).send({ error: 'inbox item 不存在' });

    db.update(inboxItems)
      .set({ archived: 1, read: 1 })
      .where(and(eq(inboxItems.id, id), recipientFilter()))
      .run();

    const row = db.select().from(inboxItems).where(eq(inboxItems.id, id)).get()!;
    let issueMeta: { identifier: string; title: string } | undefined;
    if (row.issueId) {
      const iss = db.select().from(issues).where(eq(issues.id, row.issueId)).get();
      if (iss) issueMeta = { identifier: iss.identifier, title: iss.title };
    }
    return toInboxItem(row, issueMeta);
  });
}

import type { FastifyInstance } from 'fastify';
import { desc, inArray } from 'drizzle-orm';
import type { InboxItem } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, comments, issues } from '../db/schema.js';
import { resolveAuthorLabel } from '../db/client.js';

const DEFAULT_LIMIT = 50;

function trunc(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

// S12：合成 Inbox（不落库）—— comments + 终态 runs，按 createdAt 降序 limit
export async function inboxRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/inbox', async (req) => {
    const q = req.query as { limit?: string };
    const parsed = q.limit != null ? Number(q.limit) : DEFAULT_LIMIT;
    const limit =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(Math.floor(parsed), 200)
        : DEFAULT_LIMIT;

    const commentRows = db
      .select()
      .from(comments)
      .orderBy(desc(comments.createdAt))
      .limit(limit)
      .all();

    const runRows = db
      .select()
      .from(agentRuns)
      .where(inArray(agentRuns.status, ['completed', 'failed']))
      .orderBy(desc(agentRuns.createdAt))
      .limit(limit)
      .all();

    const issueIds = new Set<string>();
    for (const c of commentRows) issueIds.add(c.issueId);
    for (const r of runRows) issueIds.add(r.issueId);

    const issueMeta = new Map<string, { identifier: string; title: string }>();
    if (issueIds.size > 0) {
      const issueRows = db
        .select({
          id: issues.id,
          identifier: issues.identifier,
          title: issues.title,
        })
        .from(issues)
        .where(inArray(issues.id, [...issueIds]))
        .all();
      for (const i of issueRows) {
        issueMeta.set(i.id, { identifier: i.identifier, title: i.title });
      }
    }

    const items: InboxItem[] = [];

    for (const c of commentRows) {
      const meta = issueMeta.get(c.issueId);
      const author = resolveAuthorLabel(c.authorType, c.authorId);
      const summary = `${author}: ${trunc(c.body, 120)}`;
      // bu01：shared InboxItem 已换真源形状；合成 feed 暂填默认字段，impl-2 换真表
      items.push({
        id: `comment:${c.id}`,
        type: 'comment',
        kind: 'comment',
        severity: 'attention',
        title: `评论 · ${meta?.identifier ?? c.issueId}`,
        body: trunc(c.body, 500),
        summary,
        createdAt: new Date(c.createdAt).toISOString(),
        issueId: c.issueId,
        issueIdentifier: meta?.identifier,
        issueTitle: meta?.title,
        read: false,
        archived: false,
      });
    }

    for (const r of runRows) {
      const meta = issueMeta.get(r.issueId);
      const kind = r.status === 'failed' ? 'run_failed' : 'run_completed';
      let summary = `Run ${r.status} · ${r.runtime}`;
      if (r.error) summary += ` · ${trunc(r.error, 80)}`;
      items.push({
        id: `run:${r.id}`,
        type: kind,
        kind,
        severity: kind === 'run_failed' ? 'action_required' : 'info',
        title: `${kind === 'run_failed' ? 'Run 失败' : 'Run 完成'} · ${meta?.identifier ?? r.issueId}`,
        body: r.error ?? null,
        summary,
        createdAt: new Date(r.createdAt).toISOString(),
        issueId: r.issueId,
        issueIdentifier: meta?.identifier,
        issueTitle: meta?.title,
        read: false,
        archived: false,
      });
    }

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return items.slice(0, limit);
  });
}

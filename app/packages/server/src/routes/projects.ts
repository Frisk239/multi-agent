import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import {
  CreateProjectInput,
  UpdateProjectInput,
  validateUpdateProject,
  type Project,
} from '@ma/shared';
import { db } from '../db/client.js';
import { projects, issues } from '../db/schema.js';
import {
  isUsableLocalDirectory,
  normalizeProjectLocalPath,
} from '../runtime/resolve-run-cwd.js';

const WS_ID = 'ws-local';

type ProjectRow = typeof projects.$inferSelect;

function loadIssueStats(projectIds: string[]): Map<string, { total: number; done: number }> {
  const map = new Map<string, { total: number; done: number }>();
  for (const id of projectIds) map.set(id, { total: 0, done: 0 });
  if (projectIds.length === 0) return map;
  const rows = db
    .select({ projectId: issues.projectId, status: issues.status })
    .from(issues)
    .where(inArray(issues.projectId, projectIds))
    .all();
  for (const r of rows) {
    if (!r.projectId) continue;
    const slot = map.get(r.projectId);
    if (!slot) continue;
    slot.total += 1;
    if (r.status === 'done' || r.status === 'cancelled') slot.done += 1;
  }
  return map;
}

/** 规范化写入：空/空白 → null；否则绝对路径字符串 */
function normalizeLocalPathInput(
  raw: string | null | undefined,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const t = raw.trim();
  if (!t) return null;
  return normalizeProjectLocalPath(t);
}

function toProject(
  row: ProjectRow,
  stats?: { total: number; done: number } | null,
): Project {
  const localPath = row.localPath ?? null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    description: row.description,
    status: row.status,
    localPath,
    localPathExists: localPath ? isUsableLocalDirectory(localPath) : false,
    issueStats: stats ?? { total: 0, done: 0 },
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/projects
  app.get('/api/projects', async () => {
    const rows = db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, WS_ID))
      .orderBy(projects.updatedAt)
      .all()
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const stats = loadIssueStats(rows.map((r) => r.id));
    return rows.map((r) => toProject(r, stats.get(r.id)));
  });

  // GET /api/projects/:id
  app.get('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, WS_ID)))
      .get();
    if (!row) return reply.status(404).send({ error: 'project 不存在' });
    const stats = loadIssueStats([id]).get(id) ?? { total: 0, done: 0 };
    return toProject(row, stats);
  });

  // POST /api/projects
  app.post('/api/projects', async (req, reply) => {
    const parsed = CreateProjectInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const now = Date.now();
    const id = crypto.randomUUID();
    const localPath = normalizeLocalPathInput(input.localPath) ?? null;
    db.insert(projects)
      .values({
        id,
        workspaceId: WS_ID,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: input.status ?? 'active',
        localPath,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const row = db.select().from(projects).where(eq(projects.id, id)).get();
    return reply.status(201).send(toProject(row!, { total: 0, done: 0 }));
  });

  // PUT /api/projects/:id
  app.put('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateProjectInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    if (!validateUpdateProject(input)) {
      return reply.status(400).send({ error: '至少传一个字段' });
    }
    const prev = db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, WS_ID)))
      .get();
    if (!prev) return reply.status(404).send({ error: 'project 不存在' });

    const updates: Partial<typeof projects.$inferInsert> = { updatedAt: Date.now() };
    if (input.title !== undefined) updates.title = input.title.trim();
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.localPath !== undefined) {
      updates.localPath = normalizeLocalPathInput(input.localPath) ?? null;
    }

    db.update(projects).set(updates).where(eq(projects.id, id)).run();
    const row = db.select().from(projects).where(eq(projects.id, id)).get();
    const stats = loadIssueStats([id]).get(id) ?? { total: 0, done: 0 };
    return toProject(row!, stats);
  });

  // DELETE /api/projects/:id —— 学 Multica 可删；本仓：先卸挂 issue.project_id，再删容器
  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const prev = db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, WS_ID)))
      .get();
    if (!prev) return reply.status(404).send({ error: 'project 不存在' });

    db.update(issues)
      .set({ projectId: null })
      .where(eq(issues.projectId, id))
      .run();
    db.delete(projects).where(eq(projects.id, id)).run();
    return reply.status(204).send();
  });
}

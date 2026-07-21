import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  CreateAgentInput,
  CreateSquadInput,
  UpdateAgentInput,
  UpdateSquadInput,
  type AgentWorkStats,
} from '@ma/shared';
import { db, sqlite } from '../db/client.js';
import { agents, agentRuns, issues, squadMembers, squads } from '../db/schema.js';
import { toAgentDetail, toAgentRun, toAgentSummary } from '../db/reshape.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { computeAgentReadiness } from '../orchestration/readiness.js';

const CLIENT_ID_RE = /^[a-z][a-z0-9_-]{1,63}$/;

function resolveNewId(optional?: string): string {
  if (optional && CLIENT_ID_RE.test(optional)) return optional;
  return crypto.randomUUID();
}

function assertAgentExists(id: string): boolean {
  const row = db.select().from(agents).where(eq(agents.id, id)).get();
  return !!row && row.archivedAt == null;
}

function replaceSquadMembers(squadId: string, memberIds: string[]): void {
  db.delete(squadMembers).where(eq(squadMembers.squadId, squadId)).run();
  for (const agentId of new Set(memberIds)) {
    if (!assertAgentExists(agentId)) {
      throw new Error(`member not found: ${agentId}`);
    }
    db.insert(squadMembers).values({ squadId, agentId }).run();
  }
}

export async function rosterRoutes(app: FastifyInstance): Promise<void> {
  // —— Agents ——

  // G25：?archived=0 默认活跃；1=仅归档；all=全部
  app.get('/api/agents', async (req) => {
    const q = req.query as { archived?: string };
    const mode = (q.archived ?? '0').toLowerCase();
    let rows = db.select().from(agents).all();
    if (mode === '1' || mode === 'true' || mode === 'archived') {
      rows = rows.filter((r) => r.archivedAt != null);
    } else if (mode === 'all') {
      // keep all
    } else {
      rows = rows.filter((r) => r.archivedAt == null);
    }
    return rows.map(toAgentSummary);
  });

  // 批量 readiness（须在 /:id 之前；避免 N+1）
  app.get('/api/agents/readiness', async (req, reply) => {
    const q = req.query as { ids?: string };
    const raw = (q.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ids = [...new Set(raw)].slice(0, 100);
    if (ids.length === 0) {
      return reply.status(400).send({ error: 'ids required (comma-separated)' });
    }
    const out: Record<string, Awaited<ReturnType<typeof computeAgentReadiness>>> = {};
    await Promise.all(
      ids.map(async (id) => {
        out[id] = await computeAgentReadiness(id);
      }),
    );
    return out;
  });

  // S05：单 agent 详情（agent 详情页 profile + MCP Tab 回填用）
  // bu02：含 instructions
  app.get('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!row) return reply.status(404).send({ error: 'agent 不存在' });
    return toAgentDetail(row);
  });

  // bu02：POST /api/agents
  app.post('/api/agents', async (req, reply) => {
    const parsed = CreateAgentInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const id = resolveNewId(input.id);
    const existing = db.select().from(agents).where(eq(agents.id, id)).get();
    if (existing) {
      return reply.status(409).send({ error: `agent id 已存在: ${id}` });
    }
    const now = Date.now();
    const model =
      input.model == null || !String(input.model).trim()
        ? null
        : String(input.model).trim();
    db.insert(agents)
      .values({
        id,
        name: input.name,
        runtime: input.runtime,
        model,
        category: input.category ?? null,
        concurrency: input.concurrency ?? 1,
        instructions: input.instructions ?? '',
        mcpServers: input.mcpServers ?? null,
        createdAt: now,
      })
      .run();
    const row = db.select().from(agents).where(eq(agents.id, id)).get()!;
    return reply.status(201).send(toAgentDetail(row));
  });

  // bu02：PATCH /api/agents/:id
  app.patch('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateAgentInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const existing = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!existing) return reply.status(404).send({ error: 'agent 不存在' });

    const patch = parsed.data;
    const updates: Partial<typeof agents.$inferInsert> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.runtime !== undefined) updates.runtime = patch.runtime;
    if (patch.model !== undefined) {
      updates.model =
        patch.model == null || !String(patch.model).trim()
          ? null
          : String(patch.model).trim();
    }
    if (patch.category !== undefined) updates.category = patch.category;
    if (patch.concurrency !== undefined) updates.concurrency = patch.concurrency;
    if (patch.instructions !== undefined) updates.instructions = patch.instructions;
    if (patch.mcpServers !== undefined) updates.mcpServers = patch.mcpServers;
    if (patch.archived !== undefined) {
      updates.archivedAt = patch.archived ? Date.now() : null;
    }

    db.update(agents).set(updates).where(eq(agents.id, id)).run();
    const row = db.select().from(agents).where(eq(agents.id, id)).get()!;
    return toAgentDetail(row);
  });

  // bu02：DELETE /api/agents/:id —— 默认软归档；?hard=1 才硬删
  app.delete('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { hard?: string };
    const hard = q.hard === '1' || q.hard === 'true';
    const existing = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!existing) return reply.status(404).send({ error: 'agent 不存在' });

    const active = db
      .select()
      .from(agentRuns)
      .where(
        and(eq(agentRuns.agentId, id), inArray(agentRuns.status, ['queued', 'running'])),
      )
      .get();
    if (active) {
      return reply.status(409).send({ error: 'agent 仍有未完成 run' });
    }

    if (!hard) {
      // G25：软归档（对齐 Multica「已归档」Tab）
      if (existing.archivedAt == null) {
        db.update(agents)
          .set({ archivedAt: Date.now() })
          .where(eq(agents.id, id))
          .run();
      }
      return reply.status(204).send();
    }

    const lead = db.select().from(squads).where(eq(squads.leaderId, id)).get();
    if (lead) {
      return reply.status(409).send({ error: `仍是小队 ${lead.name} 的 leader` });
    }

    // cascade：agent_skill / squad_member 依赖 FK onDelete cascade
    db.delete(agents).where(eq(agents.id, id)).run();
    return reply.status(204).send();
  });

  // bu02：GET /api/agents/:id/readiness
  app.get('/api/agents/:id/readiness', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await computeAgentReadiness(id);
    if (!r) return reply.status(404).send({ error: 'agent 不存在' });
    return r;
  });

  // bu02：GET /api/agents/:id/runs?limit=20
  app.get('/api/agents/:id/runs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!agent) return reply.status(404).send({ error: 'agent 不存在' });

    const q = req.query as { limit?: string };
    let limit = Number(q.limit ?? 20);
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const rows = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.agentId, id))
      .orderBy(desc(agentRuns.createdAt))
      .limit(limit)
      .all();
    return rows.map(toAgentRun);
  });

  // G12：GET /api/agents/:id/work-stats?days=30
  app.get('/api/agents/:id/work-stats', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!agent) return reply.status(404).send({ error: 'agent 不存在' });

    const q = req.query as { days?: string };
    let windowDays: number | null = 30;
    if (q.days === 'all' || q.days === '0') {
      windowDays = null;
    } else if (q.days != null && q.days !== '') {
      const n = Number(q.days);
      if (Number.isFinite(n) && n > 0) windowDays = Math.min(Math.floor(n), 365);
    }

    const sinceMs =
      windowDays == null ? null : Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const rows =
      sinceMs == null
        ? db.select().from(agentRuns).where(eq(agentRuns.agentId, id)).all()
        : db
            .select()
            .from(agentRuns)
            .where(and(eq(agentRuns.agentId, id), gte(agentRuns.createdAt, sinceMs)))
            .all();

    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    let active = 0;
    let durationSum = 0;
    let durationN = 0;
    let lastRunAtMs: number | null = null;

    for (const r of rows) {
      if (lastRunAtMs == null || r.createdAt > lastRunAtMs) lastRunAtMs = r.createdAt;
      if (r.status === 'completed') {
        completed += 1;
        if (r.startedAt != null && r.finishedAt != null && r.finishedAt >= r.startedAt) {
          durationSum += r.finishedAt - r.startedAt;
          durationN += 1;
        }
      } else if (r.status === 'failed') {
        failed += 1;
      } else if (r.status === 'cancelled') {
        cancelled += 1;
      } else if (r.status === 'queued' || r.status === 'running') {
        active += 1;
      }
    }

    const terminal = completed + failed;
    const stats: AgentWorkStats = {
      agentId: id,
      windowDays,
      total: rows.length,
      completed,
      failed,
      cancelled,
      active,
      successRate: terminal > 0 ? completed / terminal : null,
      avgDurationMs: durationN > 0 ? Math.round(durationSum / durationN) : null,
      lastRunAt: lastRunAtMs != null ? new Date(lastRunAtMs).toISOString() : null,
    };
    return stats;
  });

  // —— Squads ——

  // bu02：列表带 leaderId + memberCount
  app.get('/api/squads', async () => {
    const rows = db.select().from(squads).all();
    return rows.map((s) => {
      const memberCount =
        db
          .select({ cnt: sql<number>`COUNT(*)` })
          .from(squadMembers)
          .where(eq(squadMembers.squadId, s.id))
          .get()?.cnt ?? 0;
      return {
        id: s.id,
        name: s.name,
        leaderId: s.leaderId ?? undefined,
        memberCount,
      };
    });
  });

  // S12 B3：小队详情（protocol / directive / members）
  app.get('/api/squads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = loadSquadDetail(id);
    if (!detail) return reply.status(404).send({ error: 'squad 不存在' });
    return detail;
  });

  // bu02：POST /api/squads
  app.post('/api/squads', async (req, reply) => {
    const parsed = CreateSquadInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    if (!assertAgentExists(input.leaderId)) {
      return reply.status(400).send({ error: `leader 不存在: ${input.leaderId}` });
    }
    for (const mid of input.memberIds) {
      if (!assertAgentExists(mid)) {
        return reply.status(400).send({ error: `member 不存在: ${mid}` });
      }
    }

    const id = resolveNewId(input.id);
    const existing = db.select().from(squads).where(eq(squads.id, id)).get();
    if (existing) {
      return reply.status(409).send({ error: `squad id 已存在: ${id}` });
    }

    const now = Date.now();
    try {
      sqlite.transaction(() => {
        db.insert(squads)
          .values({
            id,
            name: input.name,
            leaderId: input.leaderId,
            operatingProtocol: input.operatingProtocol ?? '',
            missionDirective: input.missionDirective ?? '',
            createdAt: now,
          })
          .run();
        replaceSquadMembers(id, input.memberIds);
      })();
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : String(e),
      });
    }

    const detail = loadSquadDetail(id);
    if (!detail) {
      return reply.status(500).send({ error: 'squad 创建后加载失败' });
    }
    return reply.status(201).send(detail);
  });

  // bu02：PATCH /api/squads/:id
  app.patch('/api/squads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateSquadInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const existing = db.select().from(squads).where(eq(squads.id, id)).get();
    if (!existing) return reply.status(404).send({ error: 'squad 不存在' });

    const patch = parsed.data;
    if (patch.leaderId !== undefined && !assertAgentExists(patch.leaderId)) {
      return reply.status(400).send({ error: `leader 不存在: ${patch.leaderId}` });
    }
    if (patch.memberIds) {
      for (const mid of patch.memberIds) {
        if (!assertAgentExists(mid)) {
          return reply.status(400).send({ error: `member 不存在: ${mid}` });
        }
      }
    }

    try {
      sqlite.transaction(() => {
        const updates: Partial<typeof squads.$inferInsert> = {};
        if (patch.name !== undefined) updates.name = patch.name;
        if (patch.leaderId !== undefined) updates.leaderId = patch.leaderId;
        if (patch.operatingProtocol !== undefined) {
          updates.operatingProtocol = patch.operatingProtocol;
        }
        if (patch.missionDirective !== undefined) {
          updates.missionDirective = patch.missionDirective;
        }
        if (Object.keys(updates).length > 0) {
          db.update(squads).set(updates).where(eq(squads.id, id)).run();
        }
        if (patch.memberIds) {
          replaceSquadMembers(id, patch.memberIds);
        }
      })();
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : String(e),
      });
    }

    const detail = loadSquadDetail(id);
    if (!detail) {
      return reply.status(500).send({ error: 'squad 更新后加载失败' });
    }
    return detail;
  });

  // bu02：DELETE /api/squads/:id
  app.delete('/api/squads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = db.select().from(squads).where(eq(squads.id, id)).get();
    if (!existing) return reply.status(404).send({ error: 'squad 不存在' });

    const busy = db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.assigneeType, 'squad'),
          eq(issues.assigneeId, id),
          inArray(issues.status, [
            'backlog',
            'todo',
            'in_progress',
            'in_review',
            'blocked',
          ]),
        ),
      )
      .get();
    if (busy) {
      return reply
        .status(409)
        .send({ error: `小队仍被指派到未完成 issue: ${busy.identifier}` });
    }

    sqlite.transaction(() => {
      db.delete(squadMembers).where(eq(squadMembers.squadId, id)).run();
      db.delete(squads).where(eq(squads.id, id)).run();
    })();
    return reply.status(204).send();
  });
}

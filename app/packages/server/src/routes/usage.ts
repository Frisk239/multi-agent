// G17：工作区用量中心（对标 Multica /usage 的本地可算指标）
import type { FastifyInstance } from 'fastify';
import { gte } from 'drizzle-orm';
import type { UsageAgentRow, UsageDayRow, WorkspaceUsage } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, agents } from '../db/schema.js';

function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/usage?days=7|30|90（默认 30）
  app.get('/api/usage', async (req) => {
    const q = req.query as { days?: string };
    let windowDays = 30;
    if (q.days != null && q.days !== '') {
      const n = Number(q.days);
      if (Number.isFinite(n) && n > 0) windowDays = Math.min(Math.floor(n), 180);
    }

    const untilMs = Date.now();
    const sinceMs = untilMs - windowDays * 24 * 60 * 60 * 1000;

    const nameById = new Map(
      db
        .select()
        .from(agents)
        .all()
        .map((a) => [a.id, a.name] as const),
    );

    const rows = db
      .select()
      .from(agentRuns)
      .where(gte(agentRuns.createdAt, sinceMs))
      .all();

    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    let active = 0;
    let durationSum = 0;
    let durationN = 0;

    type Agg = {
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      active: number;
      durationSum: number;
      durationN: number;
    };
    const byAgent = new Map<string, Agg>();
    const byDay = new Map<string, { total: number; completed: number; failed: number; durationMs: number }>();

    function touchAgent(id: string): Agg {
      let a = byAgent.get(id);
      if (!a) {
        a = {
          total: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
          active: 0,
          durationSum: 0,
          durationN: 0,
        };
        byAgent.set(id, a);
      }
      return a;
    }

    function touchDay(key: string) {
      let d = byDay.get(key);
      if (!d) {
        d = { total: 0, completed: 0, failed: 0, durationMs: 0 };
        byDay.set(key, d);
      }
      return d;
    }

    for (const r of rows) {
      const ag = touchAgent(r.agentId);
      const day = touchDay(localDayKey(r.createdAt));
      ag.total += 1;
      day.total += 1;

      let runDur: number | null = null;
      if (r.startedAt != null && r.finishedAt != null && r.finishedAt >= r.startedAt) {
        runDur = r.finishedAt - r.startedAt;
      }

      if (r.status === 'completed') {
        completed += 1;
        ag.completed += 1;
        day.completed += 1;
        if (runDur != null) {
          durationSum += runDur;
          durationN += 1;
          ag.durationSum += runDur;
          ag.durationN += 1;
          day.durationMs += runDur;
        }
      } else if (r.status === 'failed') {
        failed += 1;
        ag.failed += 1;
        day.failed += 1;
        if (runDur != null) {
          // 失败也计时长（若有起止）
          durationSum += runDur;
          durationN += 1;
          ag.durationSum += runDur;
          ag.durationN += 1;
          day.durationMs += runDur;
        }
      } else if (r.status === 'cancelled') {
        cancelled += 1;
        ag.cancelled += 1;
      } else if (r.status === 'queued' || r.status === 'running') {
        active += 1;
        ag.active += 1;
      }
    }

    const terminal = completed + failed;
    const byAgentRows: UsageAgentRow[] = [...byAgent.entries()]
      .map(([agentId, a]) => {
        const t = a.completed + a.failed;
        return {
          agentId,
          agentName: nameById.get(agentId) ?? agentId,
          total: a.total,
          completed: a.completed,
          failed: a.failed,
          cancelled: a.cancelled,
          active: a.active,
          successRate: t > 0 ? a.completed / t : null,
          totalDurationMs: a.durationN > 0 ? a.durationSum : null,
          avgDurationMs: a.durationN > 0 ? Math.round(a.durationSum / a.durationN) : null,
        };
      })
      .sort((x, y) => y.total - x.total || y.failed - x.failed);

    const byDayRows: UsageDayRow[] = [...byDay.entries()]
      .map(([day, d]) => ({
        day,
        total: d.total,
        completed: d.completed,
        failed: d.failed,
        durationMs: d.durationMs,
      }))
      .sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0));

    const body: WorkspaceUsage = {
      windowDays,
      since: new Date(sinceMs).toISOString(),
      until: new Date(untilMs).toISOString(),
      total: rows.length,
      completed,
      failed,
      cancelled,
      active,
      successRate: terminal > 0 ? completed / terminal : null,
      totalDurationMs: durationN > 0 ? durationSum : null,
      avgDurationMs: durationN > 0 ? Math.round(durationSum / durationN) : null,
      tokensInput: null,
      tokensOutput: null,
      costUsd: null,
      byAgent: byAgentRows,
      byDay: byDayRows,
    };
    return body;
  });
}

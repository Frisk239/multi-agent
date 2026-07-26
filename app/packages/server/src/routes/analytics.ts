import type { FastifyInstance } from 'fastify';
import { gte } from 'drizzle-orm';
import type { TokenUsageAnalyticsResponse, TokenUsageGroupItem } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, agents, issues, projects } from '../db/schema.js';

function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface GroupAcc {
  id: string;
  name: string;
  promptTokens: number;
  completionTokens: number;
  runCount: number;
}

function toGroupItem(acc: GroupAcc): TokenUsageGroupItem {
  const totalTokens = acc.promptTokens + acc.completionTokens;
  const promptCostUsd = Number(((acc.promptTokens / 1_000_000) * 3.0).toFixed(6));
  const completionCostUsd = Number(((acc.completionTokens / 1_000_000) * 15.0).toFixed(6));
  const totalCostUsd = Number((promptCostUsd + completionCostUsd).toFixed(6));
  return {
    id: acc.id,
    name: acc.name,
    promptTokens: acc.promptTokens,
    completionTokens: acc.completionTokens,
    totalTokens,
    promptCostUsd,
    completionCostUsd,
    totalCostUsd,
    runCount: acc.runCount,
  };
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/analytics/token-usage?days=30&groupBy=agent|project|day
  app.get('/api/analytics/token-usage', async (req) => {
    const q = req.query as { days?: string; groupBy?: string };

    let windowDays = 30;
    if (q.days != null && q.days !== '') {
      const n = Number(q.days);
      if (Number.isFinite(n) && n > 0) {
        windowDays = Math.min(Math.floor(n), 180);
      }
    }

    let groupBy: 'agent' | 'project' | 'day' = 'agent';
    if (q.groupBy === 'project' || q.groupBy === 'day') {
      groupBy = q.groupBy;
    }

    const untilMs = Date.now();
    const sinceMs = untilMs - windowDays * 24 * 60 * 60 * 1000;

    const agentNameMap = new Map(
      db.select().from(agents).all().map((a) => [a.id, a.name] as const),
    );

    const projectNameMap = new Map(
      db.select().from(projects).all().map((p) => [p.id, p.title] as const),
    );

    const issueProjectMap = new Map(
      db.select().from(issues).all().map((i) => [i.id, i.projectId] as const),
    );

    const runs = db
      .select()
      .from(agentRuns)
      .where(gte(agentRuns.createdAt, sinceMs))
      .all();

    const byAgentMap = new Map<string, GroupAcc>();
    const byProjectMap = new Map<string, GroupAcc>();
    const byDayMap = new Map<string, GroupAcc>();

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let runsWithTokens = 0;

    for (const r of runs) {
      const pTokens = typeof r.tokensInput === 'number' && r.tokensInput > 0 ? r.tokensInput : 0;
      const cTokens = typeof r.tokensOutput === 'number' && r.tokensOutput > 0 ? r.tokensOutput : 0;

      if (pTokens > 0 || cTokens > 0) {
        runsWithTokens += 1;
      }

      totalPromptTokens += pTokens;
      totalCompletionTokens += cTokens;

      // Group by Agent
      const agentId = r.agentId;
      const agentName = agentNameMap.get(agentId) ?? agentId;
      let agentAcc = byAgentMap.get(agentId);
      if (!agentAcc) {
        agentAcc = { id: agentId, name: agentName, promptTokens: 0, completionTokens: 0, runCount: 0 };
        byAgentMap.set(agentId, agentAcc);
      }
      agentAcc.promptTokens += pTokens;
      agentAcc.completionTokens += cTokens;
      agentAcc.runCount += 1;

      // Group by Project
      const rawProjId = r.projectId ?? (r.issueId ? issueProjectMap.get(r.issueId) : null);
      const projId = rawProjId || 'unassigned';
      const projName = projId === 'unassigned' ? '未归属项目' : (projectNameMap.get(projId) ?? projId);
      let projAcc = byProjectMap.get(projId);
      if (!projAcc) {
        projAcc = { id: projId, name: projName, promptTokens: 0, completionTokens: 0, runCount: 0 };
        byProjectMap.set(projId, projAcc);
      }
      projAcc.promptTokens += pTokens;
      projAcc.completionTokens += cTokens;
      projAcc.runCount += 1;

      // Group by Day
      const dayKey = localDayKey(r.createdAt);
      let dayAcc = byDayMap.get(dayKey);
      if (!dayAcc) {
        dayAcc = { id: dayKey, name: dayKey, promptTokens: 0, completionTokens: 0, runCount: 0 };
        byDayMap.set(dayKey, dayAcc);
      }
      dayAcc.promptTokens += pTokens;
      dayAcc.completionTokens += cTokens;
      dayAcc.runCount += 1;
    }

    const byAgent = [...byAgentMap.values()]
      .map(toGroupItem)
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd || b.totalTokens - a.totalTokens);

    const byProject = [...byProjectMap.values()]
      .map(toGroupItem)
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd || b.totalTokens - a.totalTokens);

    const byDay = [...byDayMap.values()]
      .map(toGroupItem)
      .sort((a, b) => a.id.localeCompare(b.id));

    let items: TokenUsageGroupItem[];
    if (groupBy === 'project') {
      items = byProject;
    } else if (groupBy === 'day') {
      items = byDay;
    } else {
      items = byAgent;
    }

    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const promptCostUsd = Number(((totalPromptTokens / 1_000_000) * 3.0).toFixed(6));
    const completionCostUsd = Number(((totalCompletionTokens / 1_000_000) * 15.0).toFixed(6));
    const totalCostUsd = Number((promptCostUsd + completionCostUsd).toFixed(6));

    const response: TokenUsageAnalyticsResponse = {
      windowDays,
      since: new Date(sinceMs).toISOString(),
      until: new Date(untilMs).toISOString(),
      groupBy,
      totals: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
        promptCostUsd,
        completionCostUsd,
        totalCostUsd,
        totalRuns: runs.length,
        runsWithTokens,
      },
      rates: {
        promptUsdPer1M: 3.0,
        completionUsdPer1M: 15.0,
      },
      items,
      byAgent,
      byProject,
      byDay,
    };

    return response;
  });
}

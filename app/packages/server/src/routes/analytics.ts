import type { FastifyInstance } from 'fastify';
import { gte } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import type {
  TokenUsageAnalyticsResponse,
  TokenUsageGroupItem,
  OpsAnalyticsResponse,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, agents, issues, projects, activityLogs } from '../db/schema.js';
import {
  estimateCost,
  hasAnyRates,
  loadModelRates,
  type CostEstimate,
} from '../runtime/model-rates.js';

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
  promptCostUsd: number;
  completionCostUsd: number;
  costedRuns: number;
  uncostedRuns: number;
  hasCost: boolean;
}

function emptyAcc(id: string, name: string): GroupAcc {
  return {
    id,
    name,
    promptTokens: 0,
    completionTokens: 0,
    runCount: 0,
    promptCostUsd: 0,
    completionCostUsd: 0,
    costedRuns: 0,
    uncostedRuns: 0,
    hasCost: false,
  };
}

function applyEstimate(acc: GroupAcc, est: CostEstimate, pTokens: number, cTokens: number): void {
  acc.promptTokens += pTokens;
  acc.completionTokens += cTokens;
  acc.runCount += 1;
  if (est.uncosted) {
    if (est.uncostedReason !== 'no_tokens') acc.uncostedRuns += 1;
    return;
  }
  acc.hasCost = true;
  acc.costedRuns += 1;
  acc.promptCostUsd += est.promptCostUsd ?? 0;
  acc.completionCostUsd += est.completionCostUsd ?? 0;
}

function toGroupItem(acc: GroupAcc): TokenUsageGroupItem {
  const totalTokens = acc.promptTokens + acc.completionTokens;
  const promptCostUsd = acc.hasCost ? Number(acc.promptCostUsd.toFixed(6)) : null;
  const completionCostUsd = acc.hasCost ? Number(acc.completionCostUsd.toFixed(6)) : null;
  const totalCostUsd =
    acc.hasCost
      ? Number(((acc.promptCostUsd + acc.completionCostUsd)).toFixed(6))
      : null;
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
    uncostedRuns: acc.uncostedRuns,
    costedRuns: acc.costedRuns,
  };
}

function sortByCostThenTokens(a: TokenUsageGroupItem, b: TokenUsageGroupItem): number {
  const ca = a.totalCostUsd ?? -1;
  const cb = b.totalCostUsd ?? -1;
  if (cb !== ca) return cb - ca;
  return b.totalTokens - a.totalTokens;
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/analytics/token-usage?days=30&groupBy=agent|project|day|issue
  app.get('/api/analytics/token-usage', async (req) => {
    const q = req.query as { days?: string; groupBy?: string };

    let windowDays = 30;
    if (q.days != null && q.days !== '') {
      const n = Number(q.days);
      if (Number.isFinite(n) && n > 0) {
        windowDays = Math.min(Math.floor(n), 180);
      }
    }

    let groupBy: 'agent' | 'project' | 'day' | 'issue' = 'agent';
    if (q.groupBy === 'project' || q.groupBy === 'day' || q.groupBy === 'issue') {
      groupBy = q.groupBy;
    }

    const untilMs = Date.now();
    const sinceMs = untilMs - windowDays * 24 * 60 * 60 * 1000;

    const ratesConfig = loadModelRates();
    const ratesConfigured = hasAnyRates(ratesConfig);

    const agentNameMap = new Map(
      db.select({ id: agents.id, name: agents.name }).from(agents).all().map((a) => [a.id, a.name] as const),
    );

    const projectNameMap = new Map(
      db.select({ id: projects.id, title: projects.title }).from(projects).all().map((p) => [p.id, p.title] as const),
    );

    const issueMetaMap = new Map(
      db
        .select({ id: issues.id, projectId: issues.projectId, identifier: issues.identifier, title: issues.title })
        .from(issues)
        .all()
        .map((i) => [i.id, i] as const),
    );

    const runs = db
      .select()
      .from(agentRuns)
      .where(gte(agentRuns.createdAt, sinceMs))
      .all();

    const byAgentMap = new Map<string, GroupAcc>();
    const byProjectMap = new Map<string, GroupAcc>();
    const byDayMap = new Map<string, GroupAcc>();
    const byIssueMap = new Map<string, GroupAcc>();

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let runsWithTokens = 0;
    let totalPromptCost = 0;
    let totalCompletionCost = 0;
    let hasAnyCost = false;
    let costedRuns = 0;
    let uncostedRuns = 0;

    // 用于 rates 展示：若所有 costed 费率一致则回填
    let displayPromptRate: number | null = null;
    let displayCompletionRate: number | null = null;
    let ratesMixed = false;
    const seenModelKeys = new Set<string>();

    for (const r of runs) {
      const pTokens = typeof r.tokensInput === 'number' && r.tokensInput > 0 ? r.tokensInput : 0;
      const cTokens = typeof r.tokensOutput === 'number' && r.tokensOutput > 0 ? r.tokensOutput : 0;
      const model = (r as { model?: string | null }).model ?? null;

      if (pTokens > 0 || cTokens > 0) {
        runsWithTokens += 1;
      }

      totalPromptTokens += pTokens;
      totalCompletionTokens += cTokens;

      const est = estimateCost({
        model,
        tokensInput: pTokens || null,
        tokensOutput: cTokens || null,
        config: ratesConfig,
      });

      if (est.uncosted) {
        if (est.uncostedReason !== 'no_tokens') uncostedRuns += 1;
      } else {
        hasAnyCost = true;
        costedRuns += 1;
        totalPromptCost += est.promptCostUsd ?? 0;
        totalCompletionCost += est.completionCostUsd ?? 0;
        if (est.modelKey) seenModelKeys.add(est.modelKey);
        if (est.rate) {
          if (displayPromptRate == null) {
            displayPromptRate = est.rate.promptUsdPer1M;
            displayCompletionRate = est.rate.completionUsdPer1M;
          } else if (
            displayPromptRate !== est.rate.promptUsdPer1M ||
            displayCompletionRate !== est.rate.completionUsdPer1M
          ) {
            ratesMixed = true;
          }
        }
      }

      // Group by Agent
      const agentId = r.agentId;
      const agentName = agentNameMap.get(agentId) ?? agentId;
      let agentAcc = byAgentMap.get(agentId);
      if (!agentAcc) {
        agentAcc = emptyAcc(agentId, agentName);
        byAgentMap.set(agentId, agentAcc);
      }
      applyEstimate(agentAcc, est, pTokens, cTokens);

      // Group by Project
      const issueMeta = r.issueId ? issueMetaMap.get(r.issueId) : undefined;
      const rawProjId = r.projectId ?? issueMeta?.projectId ?? null;
      const projId = rawProjId || 'unassigned';
      const projName = projId === 'unassigned' ? '未归属项目' : (projectNameMap.get(projId) ?? projId);
      let projAcc = byProjectMap.get(projId);
      if (!projAcc) {
        projAcc = emptyAcc(projId, projName);
        byProjectMap.set(projId, projAcc);
      }
      applyEstimate(projAcc, est, pTokens, cTokens);

      // Group by Day
      const dayKey = localDayKey(r.createdAt);
      let dayAcc = byDayMap.get(dayKey);
      if (!dayAcc) {
        dayAcc = emptyAcc(dayKey, dayKey);
        byDayMap.set(dayKey, dayAcc);
      }
      applyEstimate(dayAcc, est, pTokens, cTokens);

      // Group by Issue
      const issueId = r.issueId || 'no-issue';
      const issueName =
        issueId === 'no-issue'
          ? '无 Issue'
          : issueMeta
            ? `${issueMeta.identifier} · ${issueMeta.title}`
            : issueId;
      let issueAcc = byIssueMap.get(issueId);
      if (!issueAcc) {
        issueAcc = emptyAcc(issueId, issueName);
        byIssueMap.set(issueId, issueAcc);
      }
      applyEstimate(issueAcc, est, pTokens, cTokens);
    }

    const byAgent = [...byAgentMap.values()].map(toGroupItem).sort(sortByCostThenTokens);
    const byProject = [...byProjectMap.values()].map(toGroupItem).sort(sortByCostThenTokens);
    const byDay = [...byDayMap.values()].map(toGroupItem).sort((a, b) => a.id.localeCompare(b.id));
    const byIssue = [...byIssueMap.values()].map(toGroupItem).sort(sortByCostThenTokens);

    let items: TokenUsageGroupItem[];
    if (groupBy === 'project') items = byProject;
    else if (groupBy === 'day') items = byDay;
    else if (groupBy === 'issue') items = byIssue;
    else items = byAgent;

    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const promptCostUsd = hasAnyCost ? Number(totalPromptCost.toFixed(6)) : null;
    const completionCostUsd = hasAnyCost ? Number(totalCompletionCost.toFixed(6)) : null;
    const totalCostUsd =
      hasAnyCost ? Number((totalPromptCost + totalCompletionCost).toFixed(6)) : null;

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
        uncostedRuns,
        costedRuns,
      },
      ratesConfigured,
      rates: ratesConfigured
        ? {
            promptUsdPer1M: ratesMixed ? null : displayPromptRate,
            completionUsdPer1M: ratesMixed ? null : displayCompletionRate,
            modelCount: Object.keys(ratesConfig.models).length,
          }
        : null,
      items,
      byAgent,
      byProject,
      byDay,
      byIssue,
    };

    return response;
  });
}

// —— G5-6：运营统计加深 —— cycle time / agent 利用率 / 失败率·改派趋势（按日） ——
// 数据源：issues.createdAt + activity_log status_changed→done（cycle time）；
// agent_runs.startedAt/finishedAt（利用率）；agent_runs.finishedAt 日分组（失败率）；
// activity_log assignee_changed 日计数（改派）。
export function buildOpsAnalytics(windowDays: number): OpsAnalyticsResponse {
  const until = Date.now();
  // 窗口语义：最近 windowDays 个自然日（含今天），从今天零点回推，避免 30 天毫秒窗口
  // 跨出 31 个日历日键的 off-by-one
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const since = todayMidnight.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000;

  // 1) cycle time：done issue 的创建 → done 耗时（status_changed to=done 最近一次为 done 时刻）
  const statusLogs = db
    .select({ issueId: activityLogs.issueId, createdAt: activityLogs.createdAt, payload: activityLogs.payload })
    .from(activityLogs)
    .where(eq(activityLogs.eventType, 'status_changed'))
    .all();
  const doneAtByIssue = new Map<string, number>();
  for (const l of statusLogs) {
    try {
      const p = JSON.parse(l.payload ?? '{}') as { to?: string };
      if (p?.to === 'done') {
        const cur = doneAtByIssue.get(l.issueId);
        if (cur === undefined || l.createdAt > cur) doneAtByIssue.set(l.issueId, l.createdAt);
      }
    } catch {
      /* 坏 payload 跳过 */
    }
  }
  const doneIssues = db
    .select({ id: issues.id, createdAt: issues.createdAt })
    .from(issues)
    .where(eq(issues.status, 'done'))
    .all();
  const cycles: number[] = [];
  for (const iss of doneIssues) {
    const doneAt = doneAtByIssue.get(iss.id);
    if (doneAt != null && doneAt >= iss.createdAt) cycles.push(doneAt - iss.createdAt);
  }
  cycles.sort((a, b) => a - b);
  const n = cycles.length;
  const cycleTime: OpsAnalyticsResponse['cycleTime'] = {
    samples: n,
    medianMs: n ? cycles[Math.floor(n / 2)] : null,
    meanMs: n ? Math.round(cycles.reduce((a, b) => a + b, 0) / n) : null,
    p90Ms: n ? cycles[Math.min(n - 1, Math.floor(n * 0.9))] : null,
  };

  // 2) agent 利用率：窗口内 run 活跃时长（startedAt→finishedAt 截断）按 agent 聚合
  const allRuns = db
    .select({
      agentId: agentRuns.agentId,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
      status: agentRuns.status,
    })
    .from(agentRuns)
    .all();
  const activeByAgent = new Map<string, number>();
  for (const r of allRuns) {
    if (r.startedAt == null) continue;
    const s = Math.max(r.startedAt, since);
    const e = r.finishedAt == null ? until : Math.min(r.finishedAt, until);
    if (e > s) activeByAgent.set(r.agentId, (activeByAgent.get(r.agentId) ?? 0) + (e - s));
  }
  const agentNameMap = new Map(
    db.select({ id: agents.id, name: agents.name }).from(agents).all().map((a) => [a.id, a.name] as const),
  );
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const agentsUtil = [...activeByAgent.entries()]
    .map(([agentId, activeMs]) => ({
      agentId,
      name: agentNameMap.get(agentId) ?? agentId,
      activeMs,
      utilization: activeMs / windowMs,
    }))
    .sort((a, b) => b.activeMs - a.activeMs);

  // 3) 失败率 / 改派趋势（按日，空日 0 填充）
  const runFailStatuses = new Set(['failed', 'timed_out']);
  const dayAcc = new Map<string, { runs: number; failed: number; reassignments: number }>();
  const dayKeys: string[] = [];
  for (let i = 0; i < windowDays; i++) dayKeys.push(localDayKey(since + i * 24 * 60 * 60 * 1000));
  const ensure = (k: string) => {
    let acc = dayAcc.get(k);
    if (!acc) {
      acc = { runs: 0, failed: 0, reassignments: 0 };
      dayAcc.set(k, acc);
    }
    return acc;
  };
  for (const r of allRuns) {
    if (r.finishedAt == null || r.finishedAt < since || r.finishedAt > until) continue;
    const acc = ensure(localDayKey(r.finishedAt));
    acc.runs += 1;
    acc.failed += runFailStatuses.has(r.status) ? 1 : 0;
  }
  const reassignLogs = db
    .select({ createdAt: activityLogs.createdAt })
    .from(activityLogs)
    .where(eq(activityLogs.eventType, 'assignee_changed'))
    .all();
  for (const l of reassignLogs) {
    if (l.createdAt < since || l.createdAt > until) continue;
    ensure(localDayKey(l.createdAt)).reassignments += 1;
  }
  const trend = dayKeys.map((k) => {
    const acc = dayAcc.get(k) ?? { runs: 0, failed: 0, reassignments: 0 };
    return {
      day: k,
      runs: acc.runs,
      failedRuns: acc.failed,
      failRate: acc.runs ? acc.failed / acc.runs : null,
      reassignments: acc.reassignments,
    };
  });

  return {
    windowDays,
    cycleTime,
    utilization: { windowMs, agents: agentsUtil },
    trend,
  };
}

export async function opsAnalyticsRoute(app: FastifyInstance): Promise<void> {
  // GET /api/analytics/ops?days=30 —— 运营统计（cycle time / 利用率 / 失败率·改派趋势）
  app.get('/api/analytics/ops', async (req) => {
    const q = req.query as { days?: string };
    let windowDays = 30;
    if (q.days != null && q.days !== '') {
      const num = Number(q.days);
      if (Number.isFinite(num) && num > 0) windowDays = Math.min(Math.floor(num), 90);
    }
    return buildOpsAnalytics(windowDays);
  });
}

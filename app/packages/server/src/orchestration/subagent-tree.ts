import { eq, and, desc } from 'drizzle-orm';
import type { AgentRunStatus, AgentRunKind, RunTreeNode } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, agents, runMessages } from '../db/schema.js';
import { deriveRunObservability } from './run-observability.js';
import { estimateCost } from '../runtime/model-rates.js';

type AgentRunRow = typeof agentRuns.$inferSelect;
type AgentRow = typeof agents.$inferSelect;

/** 父侧树摘要默认 2000 字；env: MA_SUBAGENT_SUMMARY_CAP */
export function getSubagentSummaryCap(): number {
  const raw = process.env.MA_SUBAGENT_SUMMARY_CAP;
  if (raw == null || raw.trim() === '') return 2000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 2000;
  return Math.floor(n);
}

/** 截断过长 summary，避免 fan-out 树 payload 炸前端 */
export function truncateSubagentSummary(text: string | null | undefined): string | null {
  if (text == null) return null;
  const cap = getSubagentSummaryCap();
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}…`;
}

/**
 * Pure read projection: attach Multica-style terminal reason onto tree nodes.
 * Active runs → null; cancelled prefers cancelled/user_aborted over stale failureReason.
 */
export function projectTreeNodeTerminalReason(
  row: {
    status: string;
    createdAt: number;
    failureReason?: string | null;
    error?: string | null;
  },
  now = Date.now(),
): string | null {
  return deriveRunObservability(row, now).terminalReason;
}

/**
 * Build the full delegation tree rooted at `rootRunId`.
 *
 * Optimised path: instead of loading *all* runs in the system, we walk
 * only the subtree reachable from the root via `parentRunId` links.
 */
export function getRunTree(rootRunId: string): RunTreeNode | null {
  const rootRow = db.select().from(agentRuns).where(eq(agentRuns.id, rootRunId)).get();
  if (!rootRow) return null;

  // 1. Walk the subtree breadth-first, collecting only related runs
  const subtreeRuns: AgentRunRow[] = [rootRow];
  const runsByParent = new Map<string, AgentRunRow[]>();
  const queue = [rootRunId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.parentRunId, parentId))
      .all();
    if (children.length > 0) {
      runsByParent.set(parentId, children);
      for (const child of children) {
        subtreeRuns.push(child);
        queue.push(child.id);
      }
    }
  }

  // 2. Collect unique agentIds, then batch-fetch only the needed agents
  const agentIds = new Set<string>();
  for (const r of subtreeRuns) {
    if (r.agentId) agentIds.add(r.agentId);
  }
  const agentMap = new Map<string, AgentRow>();
  if (agentIds.size > 0) {
    for (const aid of agentIds) {
      const row = db.select().from(agents).where(eq(agents.id, aid)).get();
      if (row) agentMap.set(aid, row);
    }
  }

  // 3. Fetch the latest assistant message per run for summaries (subtree only)
  const summaryMap = new Map<string, string>();
  for (const r of subtreeRuns) {
    const msg = db
      .select()
      .from(runMessages)
      .where(and(eq(runMessages.runId, r.id), eq(runMessages.kind, 'assistant')))
      .orderBy(desc(runMessages.seq))
      .limit(1)
      .get();
    if (msg) summaryMap.set(r.id, msg.body);
  }

  return buildNode(rootRow, runsByParent, agentMap, summaryMap);
}

/**
 * Direct children only – single DB query instead of full tree construction.
 */
export function getDirectChildren(parentRunId: string): RunTreeNode[] {
  const children = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.parentRunId, parentRunId))
    .all();
  if (children.length === 0) return [];

  // Collect agents
  const agentIds = new Set<string>();
  for (const r of children) {
    if (r.agentId) agentIds.add(r.agentId);
  }
  const agentMap = new Map<string, AgentRow>();
  for (const aid of agentIds) {
    const row = db.select().from(agents).where(eq(agents.id, aid)).get();
    if (row) agentMap.set(aid, row);
  }

  // Summaries (one message per child)
  const summaryMap = new Map<string, string>();
  for (const r of children) {
    const msg = db
      .select()
      .from(runMessages)
      .where(and(eq(runMessages.runId, r.id), eq(runMessages.kind, 'assistant')))
      .orderBy(desc(runMessages.seq))
      .limit(1)
      .get();
    if (msg) summaryMap.set(r.id, msg.body);
  }

  children.sort((a, b) => a.createdAt - b.createdAt);
  // Build shallow nodes (no recursive children for direct-children endpoint)
  return children.map((row) => buildNode(row, new Map(), agentMap, summaryMap));
}

function buildNode(
  row: AgentRunRow,
  runsByParent: Map<string, AgentRunRow[]>,
  agentMap: Map<string, AgentRow>,
  summaryMap: Map<string, string>
): RunTreeNode {
  const childrenRows = runsByParent.get(row.id) || [];
  childrenRows.sort((a, b) => a.createdAt - b.createdAt);

  const ag = row.agentId ? agentMap.get(row.agentId) : null;
  const startedAtIso = row.startedAt ? new Date(row.startedAt).toISOString() : null;
  const finishedAtIso = row.finishedAt ? new Date(row.finishedAt).toISOString() : null;

  let durationMs: number | null = null;
  if (row.startedAt && row.finishedAt) {
    durationMs = row.finishedAt - row.startedAt;
  } else if (row.startedAt && (row.status === 'running' || row.status === 'queued')) {
    durationMs = Date.now() - row.startedAt;
  }

  const rawSummary = summaryMap.get(row.id) || row.error || row.quickPrompt || null;
  const summary = truncateSubagentSummary(rawSummary);
  const terminalReason = projectTreeNodeTerminalReason(row);

  const children = childrenRows.map((child) =>
    buildNode(child, runsByParent, agentMap, summaryMap),
  );

  // G2-3：成本汇总（学 hermes delegate_tool.py:2730——每次只折直接子层，
  // 子节点已含其子树，嵌套树靠逐层折叠自然汇总）。
  // 自身无 token（no_tokens）不视为 uncosted：没跑过的 run 不污染「部分未计价」。
  const own = estimateCost({
    model: row.model,
    tokensInput: row.tokensInput,
    tokensOutput: row.tokensOutput,
  });
  let totalUsd = own.costUsd ?? 0;
  let uncosted = own.uncosted && own.uncostedReason !== 'no_tokens';
  for (const c of children) {
    if (c.costUsd != null) totalUsd += c.costUsd;
    if (c.uncosted) uncosted = true;
  }
  const costUsd = totalUsd > 0 ? Number(totalUsd.toFixed(6)) : null;

  return {
    id: row.id,
    parentRunId: row.parentRunId ?? null,
    agentId: row.agentId ?? null,
    agentName: ag?.name ?? row.agentId ?? (row.isLeader ? 'Squad Leader' : 'Subagent'),
    agentRole: ag?.category ?? (row.isLeader ? 'Squad Leader' : 'Subagent'),
    status: row.status as AgentRunStatus,
    kind: (row.kind ?? 'issue') as AgentRunKind,
    quickPrompt: row.quickPrompt ?? null,
    isLeader: Boolean(row.isLeader),
    squadId: row.squadId ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    durationMs,
    error: row.error ?? null,
    summary,
    tokensInput: row.tokensInput ?? null,
    tokensOutput: row.tokensOutput ?? null,
    costUsd,
    uncosted,
    terminalReason,
    children,
  };
}

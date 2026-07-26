import { eq, inArray, desc, and } from 'drizzle-orm';
import type { RunTreeNode } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, agents, runMessages } from '../db/schema.js';

type AgentRunRow = typeof agentRuns.$inferSelect;

export function getRunTree(rootRunId: string): RunTreeNode | null {
  const rootRow = db.select().from(agentRuns).where(eq(agentRuns.id, rootRunId)).get();
  if (!rootRow) return null;

  // 1. Load all agents for name/category mapping
  const allAgents = db.select().from(agents).all();
  const agentMap = new Map(allAgents.map((a) => [a.id, a]));

  // 2. Load all runs in system to construct parent -> child hierarchy
  const allRuns = db.select().from(agentRuns).all();
  const runsByParent = new Map<string, AgentRunRow[]>();
  for (const r of allRuns) {
    if (r.parentRunId) {
      const list = runsByParent.get(r.parentRunId) || [];
      list.push(r);
      runsByParent.set(r.parentRunId, list);
    }
  }

  // 3. Pre-fetch assistant run_messages for summaries
  const allRunIds = allRuns.map((r) => r.id);
  const summaryMap = new Map<string, string>();
  if (allRunIds.length > 0) {
    const assistantMsgs = db
      .select()
      .from(runMessages)
      .where(and(eq(runMessages.kind, 'assistant'), inArray(runMessages.runId, allRunIds)))
      .orderBy(desc(runMessages.seq))
      .all();
    for (const msg of assistantMsgs) {
      if (!summaryMap.has(msg.runId)) {
        summaryMap.set(msg.runId, msg.body);
      }
    }
  }

  return buildNode(rootRow, runsByParent, agentMap, summaryMap);
}

export function getDirectChildren(parentRunId: string): RunTreeNode[] {
  const rootTree = getRunTree(parentRunId);
  return rootTree ? rootTree.children : [];
}

function buildNode(
  row: AgentRunRow,
  runsByParent: Map<string, AgentRunRow[]>,
  agentMap: Map<string, any>,
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

  const summary = summaryMap.get(row.id) || row.error || row.quickPrompt || null;

  return {
    id: row.id,
    parentRunId: row.parentRunId ?? null,
    agentId: row.agentId ?? null,
    agentName: ag?.name ?? row.agentId ?? (row.isLeader ? 'Squad Leader' : 'Subagent'),
    agentRole: ag?.category ?? (row.isLeader ? 'Squad Leader' : 'Subagent'),
    status: row.status as any,
    kind: (row.kind as any) ?? 'issue',
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
    children: childrenRows.map((child) => buildNode(child, runsByParent, agentMap, summaryMap)),
  };
}

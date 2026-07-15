import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { abortRun } from './run-control.js';
import { wakeRunWorker } from './run-worker.js';
import type { AgentRun } from '@ma/shared';

const ACTIVE = ['queued', 'running'] as const;

// cancelActiveRunsForIssue —— 清空/改指派时取消该 issue 所有 active run（spec §6.1）。
export function cancelActiveRunsForIssue(issueId: string): void {
  const rows = db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.issueId, issueId), inArray(agentRuns.status, [...ACTIVE])),
    )
    .all();
  for (const row of rows) {
    cancelRunById(row.id);
  }
}

// cancelRunById —— 唯一取消入口的底层实现（spec §6.3 R1：POST /api/runs/:runId/cancel）。
// 条件 UPDATE（status IN active）→ abort 信号 → run:cancelled 事件。
export function cancelRunById(runId: string): { ok: boolean; run?: AgentRun } {
  const prev = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!prev || !ACTIVE.includes(prev.status as (typeof ACTIVE)[number])) {
    return { ok: false };
  }
  const finishedAt = Date.now();
  db.update(agentRuns)
    .set({ status: 'cancelled', finishedAt })
    .where(
      and(eq(agentRuns.id, runId), inArray(agentRuns.status, [...ACTIVE])),
    )
    .run();
  abortRun(runId); // 触发 AbortController → spawn-line kill 子进程
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get()!;
  const run = toAgentRun(row);
  eventBus.publish({ type: 'run:cancelled', run });
  return { ok: true, run };
}

// enqueueAgentRun —— 指派 agent 时插入 queued run（spec §6.1）。
// 同 issue 已有 active run 则不插（不变量：至多一条 active）。
export function enqueueAgentRun(issueId: string, agentId: string): AgentRun | null {
  const active = db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.issueId, issueId), inArray(agentRuns.status, [...ACTIVE])),
    )
    .get();
  if (active) return null;
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return null;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.insert(agentRuns)
    .values({
      id,
      issueId,
      agentId,
      runtime: agent.runtime,
      status: 'queued',
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt,
    })
    .run();
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()!;
  const run = toAgentRun(row);
  eventBus.publish({ type: 'run:queued', run });
  wakeRunWorker();
  return run;
}

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';

/** claim 前可抢状态 */
export const CLAIMABLE_RUN_STATUSES = ['queued', 'waiting_local_directory'] as const;

/** 可取消 / 可被终态覆盖的活跃状态 */
export const ACTIVE_RUN_STATUSES = [
  'queued',
  'waiting_local_directory',
  'running',
] as const;

export type RunStatus = (typeof agentRuns.$inferSelect)['status'];
export type AgentRunRow = typeof agentRuns.$inferSelect;

/** drizzle/better-sqlite3 update.set 可写字段（宽松，调用方按场景传） */
export type RunTransitionPatch = Partial<AgentRunRow>;

export type TransitionRunResult = {
  applied: boolean;
  row?: AgentRunRow;
};

/**
 * 条件状态转移：WHERE id + status IN fromStatuses，以 changes 判定是否生效。
 * changes===0 → applied=false，调用方禁止伪成功副作用（事件/inbox/abort 等）。
 */
export function transitionRun(args: {
  id: string;
  fromStatuses: readonly string[];
  patch: RunTransitionPatch;
}): TransitionRunResult {
  const { id, fromStatuses, patch } = args;
  if (fromStatuses.length === 0) return { applied: false };

  const result = db
    .update(agentRuns)
    .set(patch)
    .where(
      and(
        eq(agentRuns.id, id),
        inArray(agentRuns.status, [...fromStatuses] as RunStatus[]),
      ),
    )
    .run();

  const applied = (result.changes ?? 0) > 0;
  if (!applied) return { applied: false };

  const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
  if (!row) return { applied: false };
  return { applied: true, row };
}

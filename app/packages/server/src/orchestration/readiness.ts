import { and, eq, sql } from 'drizzle-orm';
import type { AgentReadiness, RuntimeId } from '@ma/shared';
import { db } from '../db/client.js';
import { agents, agentRuns } from '../db/schema.js';
import { getBackend } from '../runtime/registry.js';

// bu02：agent readiness = runtime detect + 并发槽 + cwd 配置
export async function computeAgentReadiness(agentId: string): Promise<AgentReadiness | null> {
  const row = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!row) return null;

  let det = { installed: false, path: null as string | null, version: null as string | null };
  try {
    const backend = getBackend(row.runtime as RuntimeId);
    det = await backend.detect();
  } catch (e) {
    return {
      agentId: row.id,
      runtime: row.runtime as RuntimeId,
      runtimeInstalled: false,
      runtimePath: null,
      runtimeVersion: null,
      concurrency: row.concurrency,
      runningCount: 0,
      slotsAvailable: row.concurrency,
      cwdConfigured: Boolean(process.env.MA_WORKSPACE_CWD),
      status: 'error',
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  const runningCount =
    db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(agentRuns)
      .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.status, 'running')))
      .get()?.cnt ?? 0;

  const cwdConfigured = Boolean(process.env.MA_WORKSPACE_CWD);
  const slotsAvailable = Math.max(0, row.concurrency - runningCount);

  let status: AgentReadiness['status'] = 'ready';
  let detail: string | null = null;
  if (!cwdConfigured) {
    status = 'cwd_missing';
    detail = '未配置 MA_WORKSPACE_CWD';
  } else if (!det.installed) {
    status = 'runtime_missing';
    detail = `runtime ${row.runtime} 未安装或不在 PATH`;
  } else if (runningCount >= row.concurrency) {
    status = 'busy';
    detail = `运行中 ${runningCount}/${row.concurrency}`;
  }

  return {
    agentId: row.id,
    runtime: row.runtime as RuntimeId,
    runtimeInstalled: det.installed,
    runtimePath: det.path,
    runtimeVersion: det.version,
    concurrency: row.concurrency,
    runningCount,
    slotsAvailable,
    cwdConfigured,
    status,
    detail,
  };
}

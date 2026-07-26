import { and, eq, sql } from 'drizzle-orm';
import type { AgentReadiness, RuntimeId } from '@ma/shared';
import { db } from '../db/client.js';
import { agents, agentRuns } from '../db/schema.js';
import { getBackend } from '../runtime/registry.js';
import { resolveWorkspaceCwd } from '../workspace-cwd.js';
import type { DetectResult } from '../runtime/types.js';

const probeSuccessTTL = new Map<string, { det: DetectResult; ts: number }>();
const GRACE_PERIOD_MS = 60_000;

// bu02：agent readiness = runtime detect + 并发槽
// 默认执行 cwd 为 ~/.multi-agent 隔离目录（学 Multica execenv），不强制 Settings 工作区。
// 仅 MA_ISSUE_USE_WORKSPACE_CWD=1 时，宿主项目路径才是执行前置条件。
export async function computeAgentReadiness(agentId: string): Promise<AgentReadiness | null> {
  const row = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!row) return null;

  const cwd = resolveWorkspaceCwd();
  const forceWorkspace =
    process.env.MA_ISSUE_USE_WORKSPACE_CWD === '1' ||
    process.env.MA_ISSUE_USE_WORKSPACE_CWD === 'true';
  const workspaceOk = cwd.configured && cwd.exists;

  let det = { installed: false, path: null as string | null, version: null as string | null };
  let detectError: Error | null = null;
  try {
    const backend = getBackend(row.runtime as RuntimeId);
    det = await backend.detect();
    if (det.installed) {
      probeSuccessTTL.set(agentId, { det, ts: Date.now() });
    } else {
      const cached = probeSuccessTTL.get(agentId);
      if (cached && Date.now() - cached.ts <= GRACE_PERIOD_MS) {
        det = cached.det;
      }
    }
  } catch (e) {
    detectError = e instanceof Error ? e : new Error(String(e));
    const cached = probeSuccessTTL.get(agentId);
    if (cached && Date.now() - cached.ts <= GRACE_PERIOD_MS) {
      det = cached.det;
      detectError = null;
    }
  }

  if (detectError) {
    return {
      agentId: row.id,
      runtime: row.runtime as RuntimeId,
      runtimeInstalled: false,
      runtimePath: null,
      runtimeVersion: null,
      concurrency: row.concurrency,
      runningCount: 0,
      slotsAvailable: row.concurrency,
      // 与下方语义一致：未强制 workspace 时不算「缺 cwd」
      cwdConfigured: forceWorkspace ? workspaceOk : true,
      status: 'error',
      detail: detectError.message,
    };
  }

  const runningCount =
    db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(agentRuns)
      .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.status, 'running')))
      .get()?.cnt ?? 0;

  const cwdConfigured = forceWorkspace ? workspaceOk : true;
  const slotsAvailable = Math.max(0, row.concurrency - runningCount);

  let status: AgentReadiness['status'] = 'ready';
  let detail: string | null = null;
  if (forceWorkspace && !workspaceOk) {
    status = 'cwd_missing';
    detail = cwd.configured
      ? `工作区路径无效: ${cwd.path}`
      : '已启用 MA_ISSUE_USE_WORKSPACE_CWD，但未配置工作区目录（Settings 或 MA_WORKSPACE_CWD）';
  } else if (!det.installed) {
    status = 'runtime_missing';
    detail = `runtime ${row.runtime} 未安装或不在 PATH`;
  } else if (runningCount >= row.concurrency) {
    status = 'busy';
    detail = `运行中 ${runningCount}/${row.concurrency}`;
  } else if (!forceWorkspace) {
    detail = workspaceOk
      ? `执行用隔离 workdir；工作区已配置（wiki/skills）：${cwd.path}`
      : '执行用隔离 workdir（~/.multi-agent/run-workspaces）；工作区未配置不影响派活';
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

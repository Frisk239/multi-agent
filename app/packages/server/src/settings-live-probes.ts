/** Slice 51：Settings live-probes — 真实 runtime detect/readiness + 在途 run 心跳 */

import { inArray } from 'drizzle-orm';
import { db } from './db/client.js';
import { agentRuns } from './db/schema.js';
import { allBackends } from './runtime/registry.js';
import { listActiveRunIds } from './orchestration/run-control.js';

export type LiveProbeRuntime = {
  id: string;
  label: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  /** executionImplemented !== false 且 detect.installed */
  ready: boolean;
  executionImplemented: boolean;
  supportsSessionResume: boolean;
};

export type LiveProbeRun = {
  id: string;
  runtime: string;
  status: string;
  kind: string | null;
  agentId: string;
  issueId: string | null;
  lastHeartbeatAt: number | null;
  startedAt: number | null;
  createdAt: number;
  queueAgeMs: number | null;
  /** 本进程 AbortController 是否仍持有（真在途） */
  inProcess: boolean;
  heartbeatAgeMs: number | null;
};

export type LiveProbesResponse = {
  ts: number;
  pid: number;
  activeCount: number;
  activeRuns: number;
  inProcessCount: number;
  probes: LiveProbeRun[];
  runtimes: LiveProbeRuntime[];
};

export function projectLiveProbeRun(
  row: {
    id: string;
    runtime: string;
    status: string;
    kind: string | null;
    agentId: string;
    issueId: string | null;
    lastHeartbeatAt: number | null;
    startedAt: number | null;
    createdAt: number;
    waitingLocalEnteredAt: number | null;
  },
  now: number,
  inProcessIds: ReadonlySet<string>,
): LiveProbeRun {
  const hb = row.lastHeartbeatAt ?? row.startedAt ?? row.createdAt;
  const queueAgeMs =
    row.status === 'queued'
      ? Math.max(0, now - row.createdAt)
      : row.status === 'waiting_local_directory'
        ? Math.max(0, now - (row.waitingLocalEnteredAt ?? row.createdAt))
        : null;
  return {
    id: row.id,
    runtime: row.runtime,
    status: row.status,
    kind: row.kind ?? null,
    agentId: row.agentId,
    issueId: row.issueId,
    lastHeartbeatAt: row.lastHeartbeatAt,
    startedAt: row.startedAt,
    createdAt: row.createdAt,
    queueAgeMs,
    inProcess: inProcessIds.has(row.id),
    heartbeatAgeMs: row.status === 'running' ? Math.max(0, now - hb) : null,
  };
}

export async function buildLiveProbes(now = Date.now()): Promise<LiveProbesResponse> {
  const runtimes: LiveProbeRuntime[] = [];
  for (const b of allBackends()) {
    const d = await b.detect();
    const executionImplemented = b.executionImplemented !== false;
    const ready = executionImplemented && d.installed;
    runtimes.push({
      id: b.id,
      label: b.label,
      installed: d.installed,
      version: d.version,
      path: d.path,
      ready,
      executionImplemented,
      supportsSessionResume: b.supportsSessionResume === true,
    });
  }

  const inProcessIds = new Set(listActiveRunIds());
  const rows = db
    .select({
      id: agentRuns.id,
      runtime: agentRuns.runtime,
      status: agentRuns.status,
      kind: agentRuns.kind,
      agentId: agentRuns.agentId,
      issueId: agentRuns.issueId,
      lastHeartbeatAt: agentRuns.lastHeartbeatAt,
      startedAt: agentRuns.startedAt,
      createdAt: agentRuns.createdAt,
      waitingLocalEnteredAt: agentRuns.waitingLocalEnteredAt,
    })
    .from(agentRuns)
    .where(
      inArray(agentRuns.status, [
        'queued',
        'waiting_local_directory',
        'running',
      ]),
    )
    .all();

  // 在途优先 running，其次按心跳/创建时间新→旧
  const sorted = [...rows].sort((a, b) => {
    const rank = (s: string) =>
      s === 'running' ? 0 : s === 'waiting_local_directory' ? 1 : 2;
    const dr = rank(a.status) - rank(b.status);
    if (dr !== 0) return dr;
    const ah = a.lastHeartbeatAt ?? a.startedAt ?? a.createdAt;
    const bh = b.lastHeartbeatAt ?? b.startedAt ?? b.createdAt;
    return bh - ah;
  });

  const probes: LiveProbeRun[] = sorted.map((row) =>
    projectLiveProbeRun(row, now, inProcessIds),
  );

  const activeRunning = probes.filter((p) => p.status === 'running').length;

  return {
    ts: now,
    pid: process.pid,
    activeCount: probes.length,
    activeRuns: activeRunning,
    inProcessCount: inProcessIds.size,
    probes,
    runtimes,
  };
}

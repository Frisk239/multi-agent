/**
 * Slice 75 · 进程生命周期硬化（residual process tree kill）
 *
 * unit 路径（无服必绿）：
 * - killProcessTree win32/posix 契约
 * - track/untrack + killAllTrackedTrees
 * - cancelAllActiveRuns residual tree kill + lastShutdown snapshot
 * - buildProcessHealth 透传 treeKilled
 * - 源文件接线：spawn-line / healthz / ops 含 tree kill 路径
 *
 * live（SERVER 可达时）：
 * - GET /healthz 200 + 字段
 * - GET /api/ops/snapshot 200 + process 字段
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice75-shutdown.mts
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cancelAllActiveRuns,
  getLastShutdownSnapshot,
  shutdownServer,
  __resetLastShutdownForTests,
} from '../src/orchestration/graceful-shutdown.js';
import {
  buildProcessHealth,
  __resetProcessHealthForTests,
} from '../src/process-health.js';
import {
  __resetTrackedChildPidsForTests,
  killAllTrackedTrees,
  killProcessTree,
  listTrackedChildPids,
  trackChildPid,
  trackedChildCount,
  untrackChildPid,
} from '../src/runtime/process-tree.js';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:3001';

type Status = 'PASS' | 'FAIL' | 'SKIP' | 'WARN';

interface CheckRow {
  id: string;
  status: Status;
  note: string;
}

const results: CheckRow[] = [];
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../../../.progress/logs');
const SRC_ROOT = join(__dirname, '../src');
const logLines: string[] = [];

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  logLines.push(line);
}

function record(row: CheckRow): void {
  results.push(row);
  log(`  [${row.status}] ${row.id} — ${row.note}`);
}

async function api(
  method: string,
  path: string,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const url = path.startsWith('http') ? path : `${SERVER}${path}`;
  const res = await fetch(url, {
    method,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

function finish(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice75-shutdown-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch (e) {
    log(`log write failed: ${e}`);
  }

  const fail = results.filter((r) => r.status === 'FAIL').length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  log(`summary pass=${pass} fail=${fail} skip=${skip}`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

function sourceContains(rel: string, needles: string[]): boolean {
  const p = join(SRC_ROOT, rel);
  const text = readFileSync(p, 'utf8');
  return needles.every((n) => text.includes(n));
}

async function runUnitPath(): Promise<void> {
  log('— unit path (no server) —');

  __resetTrackedChildPidsForTests();
  __resetLastShutdownForTests();
  __resetProcessHealthForTests();

  // 1. track / untrack
  try {
    trackChildPid(1001);
    trackChildPid(1002);
    if (trackedChildCount() !== 2 || !listTrackedChildPids().includes(1001)) {
      record({
        id: 'unit.track.pids',
        status: 'FAIL',
        note: `count=${trackedChildCount()} pids=${listTrackedChildPids().join(',')}`,
      });
    } else {
      untrackChildPid(1001);
      record({
        id: 'unit.track.pids',
        status: trackedChildCount() === 1 ? 'PASS' : 'FAIL',
        note: `after untrack count=${trackedChildCount()}`,
      });
    }
  } catch (e) {
    record({
      id: 'unit.track.pids',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  // 2. killProcessTree win32
  try {
    const killCalls: Array<[number, string]> = [];
    const spawnCalls: Array<[string, string[]]> = [];
    const r = killProcessTree(4242, {
      platform: 'win32',
      kill: ((pid: number, sig?: string) => {
        killCalls.push([pid, String(sig ?? '')]);
      }) as typeof process.kill,
      spawnTaskkill: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args]);
        return { on: () => undefined } as never;
      }) as typeof import('node:child_process').spawn,
    });
    const ok =
      r.attempted === true &&
      r.taskkill === true &&
      killCalls.some(([p, s]) => p === 4242 && s === 'SIGTERM') &&
      spawnCalls.some(
        ([cmd, args]) =>
          cmd === 'taskkill' &&
          args.includes('/pid') &&
          args.includes('4242') &&
          args.includes('/T') &&
          args.includes('/F'),
      );
    record({
      id: 'unit.kill.win32',
      status: ok ? 'PASS' : 'FAIL',
      note: ok
        ? 'SIGTERM + taskkill /T /F'
        : `r=${JSON.stringify(r)} kill=${JSON.stringify(killCalls)} spawn=${JSON.stringify(spawnCalls)}`,
    });
  } catch (e) {
    record({
      id: 'unit.kill.win32',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. killProcessTree posix group
  try {
    const killCalls: Array<[number, string]> = [];
    const r = killProcessTree(77, {
      platform: 'linux',
      kill: ((pid: number, sig?: string) => {
        killCalls.push([pid, String(sig ?? '')]);
      }) as typeof process.kill,
    });
    const ok =
      r.attempted &&
      !r.taskkill &&
      killCalls.some(([p]) => p === 77) &&
      killCalls.some(([p]) => p === -77);
    record({
      id: 'unit.kill.posix',
      status: ok ? 'PASS' : 'FAIL',
      note: ok ? 'self + process group SIGTERM' : JSON.stringify({ r, killCalls }),
    });
  } catch (e) {
    record({
      id: 'unit.kill.posix',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  // 4. killAllTrackedTrees clears registry
  try {
    __resetTrackedChildPidsForTests();
    trackChildPid(11);
    trackChildPid(22);
    const kill = ((pid: number) => {
      void pid;
    }) as typeof process.kill;
    const report = killAllTrackedTrees({
      platform: 'linux',
      kill,
    });
    const ok = report.attempted === 2 && trackedChildCount() === 0;
    record({
      id: 'unit.killAllTracked',
      status: ok ? 'PASS' : 'FAIL',
      note: `attempted=${report.attempted} remaining=${trackedChildCount()}`,
    });
  } catch (e) {
    record({
      id: 'unit.killAllTracked',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  // 5. cancelAllActiveRuns residual tree kill
  try {
    __resetLastShutdownForTests();
    const killAll = async () =>
      cancelAllActiveRuns({
        graceMs: 20,
        pollMs: 5,
        deps: {
          listDbActiveRunIds: () => [],
          cancelRunsMany: () => ({ cancelled: 0 }),
          listActiveRunIds: () => [],
          abortRun: () => false,
          sleep: async () => undefined,
          now: () => 0,
          trackedChildCount: () => 2,
          killAllTrackedTrees: () => ({
            attempted: 2,
            pids: [1, 2],
            results: [
              { pid: 1, platform: 'linux', attempted: true, taskkill: false },
              { pid: 2, platform: 'linux', attempted: true, taskkill: false },
            ],
          }),
        },
      });
    const report = await killAll();
    const ok = report.treeKilled === 2 && report.treeKillPids.join(',') === '1,2';
    record({
      id: 'unit.shutdown.treeKill',
      status: ok ? 'PASS' : 'FAIL',
      note: `treeKilled=${report.treeKilled} pids=${report.treeKillPids.join(',')}`,
    });
  } catch (e) {
    record({
      id: 'unit.shutdown.treeKill',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  // 6. shutdownServer lastShutdown snapshot
  try {
    __resetLastShutdownForTests();
    const report = await shutdownServer({
      graceMs: 20,
      walCheckpoint: false,
      deps: {
        stopWorkers: () => undefined,
        listDbActiveRunIds: () => [],
        cancelRunsMany: () => ({ cancelled: 0 }),
        listActiveRunIds: () => [],
        abortRun: () => false,
        sleep: async () => undefined,
        now: () => 999,
        trackedChildCount: () => 1,
        killAllTrackedTrees: () => ({
          attempted: 1,
          pids: [9],
          results: [{ pid: 9, platform: 'linux', attempted: true, taskkill: false }],
        }),
      },
    });
    const snap = getLastShutdownSnapshot();
    const ok =
      report.treeKilled === 1 &&
      snap != null &&
      snap.treeKilled === 1 &&
      snap.at === 999;
    record({
      id: 'unit.shutdown.snapshot',
      status: ok ? 'PASS' : 'FAIL',
      note: ok
        ? 'lastShutdown.treeKilled=1'
        : `report=${report.treeKilled} snap=${JSON.stringify(snap)}`,
    });
  } catch (e) {
    record({
      id: 'unit.shutdown.snapshot',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  // 7. process-health treeKilled passthrough
  try {
    const h = buildProcessHealth({
      now: 1,
      db: { ok: true, latencyMs: 0 },
      treeKilled: 4,
    });
    record({
      id: 'unit.health.treeKilled',
      status: h.treeKilled === 4 ? 'PASS' : 'FAIL',
      note: `treeKilled=${h.treeKilled}`,
    });
  } catch (e) {
    record({
      id: 'unit.health.treeKilled',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  // 8. source wiring
  try {
    const spawnOk = sourceContains('runtime/spawn-line.ts', [
      'killProcessTree',
      'trackChildPid',
      'untrackChildPid',
    ]);
    const healthzOk = sourceContains('routes/healthz.ts', [
      'getLastShutdownSnapshot',
      'treeKilled',
    ]);
    const opsOk = sourceContains('routes/ops.ts', [
      'getLastShutdownSnapshot',
      'treeKilled',
    ]);
    const shutOk = sourceContains('orchestration/graceful-shutdown.ts', [
      'killAllTrackedTrees',
      'treeKilled',
    ]);
    const ok = spawnOk && healthzOk && opsOk && shutOk;
    record({
      id: 'unit.source.wiring',
      status: ok ? 'PASS' : 'FAIL',
      note: `spawn=${spawnOk} healthz=${healthzOk} ops=${opsOk} shutdown=${shutOk}`,
    });
  } catch (e) {
    record({
      id: 'unit.source.wiring',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }
}

async function runLivePath(): Promise<void> {
  log('— live path (optional) —');
  let reachable = false;
  try {
    const hz = await api('GET', '/healthz');
    reachable = hz.ok;
    if (!hz.ok) {
      record({
        id: 'live.healthz',
        status: 'SKIP',
        note: `SERVER unreachable status=${hz.status}`,
      });
    } else {
      const hasStatus = hz.json && (hz.json.status === 'ok' || hz.json.status === 'degraded');
      const hasWorkers = hz.json && hz.json.workers && typeof hz.json.workers === 'object';
      record({
        id: 'live.healthz',
        status: hasStatus && hasWorkers ? 'PASS' : 'FAIL',
        note: hasStatus
          ? `status=${hz.json.status} treeKilled=${hz.json.treeKilled ?? 'n/a'}`
          : `body=${JSON.stringify(hz.json)?.slice(0, 200)}`,
      });
    }
  } catch (e) {
    record({
      id: 'live.healthz',
      status: 'SKIP',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  if (!reachable) {
    record({
      id: 'live.ops.snapshot',
      status: 'SKIP',
      note: 'SERVER unreachable',
    });
    return;
  }

  try {
    const snap = await api('GET', '/api/ops/snapshot');
    const proc = snap.json?.process;
    const ok =
      snap.ok &&
      proc &&
      (proc.status === 'ok' || proc.status === 'degraded') &&
      typeof proc.uptimeMs === 'number';
    record({
      id: 'live.ops.snapshot',
      status: ok ? 'PASS' : 'FAIL',
      note: ok
        ? `process.status=${proc.status} treeKilled=${proc.treeKilled ?? 'n/a'}`
        : `status=${snap.status} body=${JSON.stringify(snap.json)?.slice(0, 200)}`,
    });
  } catch (e) {
    record({
      id: 'live.ops.snapshot',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }
}

async function main(): Promise<void> {
  log('e2e-slice75-shutdown start');
  await runUnitPath();
  await runLivePath();
  finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

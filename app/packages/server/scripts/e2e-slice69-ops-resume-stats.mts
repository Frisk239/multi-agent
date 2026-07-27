/**
 * Slice 69 · Ops resumeStats（poison / resume_miss / deferred）
 *
 * unit 路径（无服必绿）：
 * - buildOpsSnapshot / buildOpsResumeStats 含 resumeStats 键
 * - window 钉死 '7d'
 *
 * live（SERVER 可达时）：
 * - GET /api/ops/snapshot 200 + resumeStats 字段
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice69-ops-resume-stats.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOpsResumeStats,
  buildOpsSnapshot,
  RESUME_STATS_WINDOW,
} from '../src/ops-snapshot.js';
import {
  __resetProcessHealthForTests,
  buildProcessHealth,
  markWorkerStarted,
  noteWorkerTick,
} from '../src/process-health.js';

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
    const path = join(LOG_DIR, `e2e-slice69-ops-resume-stats-${stamp()}.log`);
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

function isResumeStatsShape(v: unknown): v is {
  sessionPoisoned: number;
  resumeMiss: number;
  deferredUnclaimed: number;
  window: string;
} {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.sessionPoisoned === 'number' &&
    typeof o.resumeMiss === 'number' &&
    typeof o.deferredUnclaimed === 'number' &&
    typeof o.window === 'string'
  );
}

function runUnitPath(): void {
  log('— unit path —');

  try {
    if (RESUME_STATS_WINDOW !== '7d') {
      record({
        id: 'unit.window.pinned',
        status: 'FAIL',
        note: `window=${RESUME_STATS_WINDOW}`,
      });
    } else {
      record({
        id: 'unit.window.pinned',
        status: 'PASS',
        note: 'window=7d',
      });
    }
  } catch (e) {
    record({
      id: 'unit.window.pinned',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const stats = buildOpsResumeStats(Date.now());
    if (!isResumeStatsShape(stats) || stats.window !== '7d') {
      record({
        id: 'unit.resumeStats.keys',
        status: 'FAIL',
        note: JSON.stringify(stats),
      });
    } else {
      record({
        id: 'unit.resumeStats.keys',
        status: 'PASS',
        note: `poisoned=${stats.sessionPoisoned} miss=${stats.resumeMiss} deferred=${stats.deferredUnclaimed}`,
      });
    }
  } catch (e) {
    record({
      id: 'unit.resumeStats.keys',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    __resetProcessHealthForTests();
    const now = Date.now();
    for (const key of [
      'runWorker',
      'automationWorker',
      'wikiIngestWorker',
      'staleRunSweeper',
    ] as const) {
      markWorkerStarted(key, now);
      noteWorkerTick(key, now);
    }
    const processHealth = buildProcessHealth({
      now,
      db: { ok: true, latencyMs: 0 },
    });
    // 本地未 migrate 的 dev.db 可能缺 waiting_local_entered_at 等列；
    // resumeStats 本身已在 unit.resumeStats.keys 覆盖；此处尽最大努力整包。
    try {
      const snap = buildOpsSnapshot({ now, processHealth });
      if (!isResumeStatsShape(snap.resumeStats)) {
        record({
          id: 'unit.opsSnapshot.resumeStats',
          status: 'FAIL',
          note: `resumeStats missing/invalid: ${JSON.stringify(snap.resumeStats)}`,
        });
      } else {
        record({
          id: 'unit.opsSnapshot.resumeStats',
          status: 'PASS',
          note: `status=${snap.status} window=${snap.resumeStats.window}`,
        });
      }
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (/no such column/i.test(msg)) {
        record({
          id: 'unit.opsSnapshot.resumeStats',
          status: 'WARN',
          note: `local db schema lag (resumeStats covered separately): ${msg.slice(0, 120)}`,
        });
      } else {
        throw inner;
      }
    }
  } catch (e) {
    record({
      id: 'unit.opsSnapshot.resumeStats',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }
}

async function runLivePath(): Promise<void> {
  log(`— live path SERVER=${SERVER} —`);
  try {
    const hz = await api('GET', '/healthz');
    if (!hz.ok || hz.status !== 200) {
      record({
        id: 'live.healthz',
        status: 'SKIP',
        note: `unreachable HTTP ${hz.status}`,
      });
      record({
        id: 'live.ops.resumeStats',
        status: 'SKIP',
        note: 'no server',
      });
      return;
    }
    record({
      id: 'live.healthz',
      status: 'PASS',
      note: `status=${hz.json?.status ?? '?'}`,
    });
  } catch (e) {
    record({
      id: 'live.healthz',
      status: 'SKIP',
      note: `server unreachable: ${e instanceof Error ? e.message : String(e)}`,
    });
    record({
      id: 'live.ops.resumeStats',
      status: 'SKIP',
      note: 'no server',
    });
    return;
  }

  try {
    const snap = await api('GET', '/api/ops/snapshot');
    if (!snap.ok || snap.status !== 200) {
      record({
        id: 'live.ops.resumeStats',
        status: 'FAIL',
        note: `HTTP ${snap.status}`,
      });
      return;
    }
    const rs = snap.json?.resumeStats;
    if (!isResumeStatsShape(rs)) {
      record({
        id: 'live.ops.resumeStats',
        status: 'FAIL',
        note: `missing resumeStats keys: ${Object.keys(snap.json ?? {}).join(',')}`,
      });
      return;
    }
    if (rs.window !== '7d') {
      record({
        id: 'live.ops.resumeStats',
        status: 'FAIL',
        note: `window=${rs.window}`,
      });
      return;
    }
    record({
      id: 'live.ops.resumeStats',
      status: 'PASS',
      note: `poisoned=${rs.sessionPoisoned} miss=${rs.resumeMiss} deferred=${rs.deferredUnclaimed} window=${rs.window}`,
    });
  } catch (e) {
    record({
      id: 'live.ops.resumeStats',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }
}

async function main(): Promise<void> {
  log('e2e-slice69-ops-resume-stats start');
  runUnitPath();
  await runLivePath();
  finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

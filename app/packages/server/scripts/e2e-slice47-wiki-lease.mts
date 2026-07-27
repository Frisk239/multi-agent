/**
 * Slice 47 · Wiki running lease（H2）· API smoke
 *
 * 默认：SERVER=http://127.0.0.1:3001
 * 无服 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖：
 * 1. healthz 可达
 * 2. GET /api/wiki/jobs 可读（字段含 status / failCount / nextAttemptAt）
 * 3. 若有 running 作业：记录 startedAt/updatedAt（lease 候选可观测）
 * 4. dead bulk retry 端点仍在（兼容）
 *
 * 核心 lease 语义以 unit 为准（时钟注入）；本脚本为 live smoke。
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice47-wiki-lease.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const url = path.startsWith('http') ? path : `${SERVER}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
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

function finish(skipped: boolean): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice47-wiki-lease-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 47 wiki-lease e2e report');
  console.log('========================================');
  for (const r of results) {
    console.log(`[${r.status}] ${r.id} — ${r.note}`);
  }
  const fails = results.filter((r) => r.status === 'FAIL');
  const skips = results.filter((r) => r.status === 'SKIP');
  if (fails.length) {
    console.error(`\nFAIL: ${fails.length} check(s)`);
    process.exitCode = 1;
    return;
  }
  if (skipped || (skips.length && results.every((r) => r.status === 'SKIP' || r.status === 'WARN'))) {
    console.log(`\nSKIP: server unavailable or suite skipped`);
    process.exitCode = 0;
    return;
  }
  console.log(`\nPASS: ${results.filter((r) => r.status === 'PASS').length} check(s)`);
  process.exitCode = 0;
}

async function main(): Promise<void> {
  log(`Slice 47 wiki running-lease e2e · SERVER=${SERVER}`);

  let serverUp = false;
  try {
    const hz = await api('GET', '/healthz');
    serverUp = hz.ok || hz.status === 200;
    record({
      id: 'service.healthz',
      status: serverUp ? 'PASS' : 'FAIL',
      note: `HTTP ${hz.status}`,
    });
  } catch (e: any) {
    record({
      id: 'service.healthz',
      status: 'SKIP',
      note: `SERVER 不可达: ${e?.message ?? e}（请先起 server@3001）`,
    });
    finish(true);
    return;
  }

  if (!serverUp) {
    record({
      id: 'suite',
      status: 'SKIP',
      note: 'healthz 非 200，跳过其余',
    });
    finish(true);
    return;
  }

  // jobs list + field contract
  try {
    const jobs = await api('GET', '/api/wiki/jobs');
    if (!jobs.ok || !Array.isArray(jobs.json)) {
      record({
        id: 'wiki.jobs.list',
        status: 'FAIL',
        note: `expected array, HTTP ${jobs.status}`,
      });
    } else {
      const sample = jobs.json[0];
      const hasShape =
        sample == null ||
        (typeof sample === 'object' &&
          'status' in sample &&
          'failCount' in sample &&
          ('nextAttemptAt' in sample || sample.nextAttemptAt === null));
      record({
        id: 'wiki.jobs.list',
        status: hasShape ? 'PASS' : 'FAIL',
        note: hasShape
          ? `count=${jobs.json.length}${sample ? ` sample.status=${sample.status} failCount=${sample.failCount}` : ' (empty)'}`
          : 'missing status/failCount/nextAttemptAt on sample',
      });

      const running = jobs.json.filter((j: any) => j?.status === 'running');
      if (running.length) {
        const r0 = running[0];
        record({
          id: 'wiki.jobs.running.observability',
          status: 'PASS',
          note: `running=${running.length} id=${r0.id} startedAt=${r0.startedAt ?? 'null'} updatedAt=${r0.updatedAt}`,
        });
      } else {
        record({
          id: 'wiki.jobs.running.observability',
          status: 'WARN',
          note: 'no running jobs live; lease requeue covered by unit (clock inject)',
        });
      }

      const dead = jobs.json.filter((j: any) => j?.status === 'dead');
      record({
        id: 'wiki.jobs.dead.count',
        status: 'PASS',
        note: `dead=${dead.length} (bulk retry still available)`,
      });
    }
  } catch (e: any) {
    record({
      id: 'wiki.jobs.list',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }

  // retry-dead endpoint still wired (compat with bulk retry)
  try {
    const retry = await api('POST', '/api/wiki/jobs/retry-dead');
    const body = retry.json;
    const okShape =
      retry.ok &&
      body &&
      typeof body.retried === 'number' &&
      typeof body.requested === 'number';
    record({
      id: 'wiki.jobs.retry-dead',
      status: okShape ? 'PASS' : 'FAIL',
      note: okShape
        ? `HTTP ${retry.status} requested=${body.requested} retried=${body.retried}`
        : `HTTP ${retry.status} body=${JSON.stringify(body)?.slice(0, 200)}`,
    });
  } catch (e: any) {
    record({
      id: 'wiki.jobs.retry-dead',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }

  // optional: status filter pending (claim path still lists)
  try {
    const pending = await api('GET', '/api/wiki/jobs?status=pending');
    record({
      id: 'wiki.jobs.filter.pending',
      status: pending.ok && Array.isArray(pending.json) ? 'PASS' : 'FAIL',
      note: pending.ok
        ? `pending=${Array.isArray(pending.json) ? pending.json.length : '?'}`
        : `HTTP ${pending.status}`,
    });
  } catch (e: any) {
    record({
      id: 'wiki.jobs.filter.pending',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }

  finish(false);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

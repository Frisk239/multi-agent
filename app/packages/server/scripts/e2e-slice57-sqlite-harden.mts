/**
 * Slice 57 · SQLite 硬化（busy_timeout / WAL / ops.sqlite）
 *
 * 默认：
 * - 进程内 open DB 测 pragma（必跑）
 * - SERVER=http://127.0.0.1:3001 时可选 live：GET /api/ops/snapshot.sqlite
 * - 无服 → live SKIP（不粉饰 PASS）
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice57-sqlite-harden.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  applySqlitePragmas,
  readSqlitePragmas,
  resolveSqliteBusyTimeoutMs,
} from '../src/db/sqlite-pragmas.js';

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
    const path = join(LOG_DIR, `e2e-slice57-sqlite-harden-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch (e) {
    log(`log write failed: ${e}`);
  }

  const fail = results.filter((r) => r.status === 'FAIL').length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  log(`summary pass=${pass} fail=${fail} skip=${skip} warn=${warn}`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

function runInProcessPragma(): void {
  log('— in-process pragma path —');
  try {
    const ms = resolveSqliteBusyTimeoutMs({ MA_SQLITE_BUSY_TIMEOUT_MS: '5000' });
    if (ms !== 5000) {
      record({
        id: 'unit.resolveBusyTimeout',
        status: 'FAIL',
        note: `expected 5000 got ${ms}`,
      });
    } else {
      record({
        id: 'unit.resolveBusyTimeout',
        status: 'PASS',
        note: `default=${DEFAULT_SQLITE_BUSY_TIMEOUT_MS}`,
      });
    }
  } catch (e) {
    record({
      id: 'unit.resolveBusyTimeout',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(':memory:');
    applySqlitePragmas(db, { busyTimeoutMs: 5000 });
    const busy = Number(db.pragma('busy_timeout', { simple: true }));
    const read = readSqlitePragmas(db);
    if (busy !== 5000) {
      record({
        id: 'unit.pragma.busy_timeout',
        status: 'FAIL',
        note: `PRAGMA busy_timeout=${busy}`,
      });
    } else {
      record({
        id: 'unit.pragma.busy_timeout',
        status: 'PASS',
        note: `busy_timeout=${busy} journal=${read.journalMode} fk=${read.foreignKeys}`,
      });
    }
    if (read.foreignKeys !== 1) {
      record({
        id: 'unit.pragma.foreign_keys',
        status: 'FAIL',
        note: `foreign_keys=${read.foreignKeys}`,
      });
    } else {
      record({
        id: 'unit.pragma.foreign_keys',
        status: 'PASS',
        note: 'ON',
      });
    }
  } catch (e) {
    record({
      id: 'unit.pragma.busy_timeout',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

async function runLiveOps(): Promise<void> {
  log(`— live path SERVER=${SERVER} —`);
  try {
    const hz = await api('GET', '/healthz');
    if (!(hz.ok && hz.status === 200)) {
      record({
        id: 'live.healthz',
        status: 'SKIP',
        note: `unreachable or HTTP ${hz.status}`,
      });
      record({
        id: 'live.ops.sqlite',
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
      id: 'live.ops.sqlite',
      status: 'SKIP',
      note: 'no server',
    });
    return;
  }

  try {
    const snap = await api('GET', '/api/ops/snapshot');
    if (!snap.ok || snap.status !== 200) {
      record({
        id: 'live.ops.sqlite',
        status: 'FAIL',
        note: `HTTP ${snap.status}`,
      });
      return;
    }
    const sqlite = snap.json?.sqlite;
    if (!sqlite || typeof sqlite.busyTimeoutMs !== 'number') {
      record({
        id: 'live.ops.sqlite',
        status: 'FAIL',
        note: `missing sqlite field: ${JSON.stringify(sqlite)}`,
      });
      return;
    }
    if (sqlite.busyTimeoutMs < 0) {
      record({
        id: 'live.ops.sqlite',
        status: 'FAIL',
        note: `busyTimeoutMs=${sqlite.busyTimeoutMs}`,
      });
      return;
    }
    record({
      id: 'live.ops.sqlite',
      status: 'PASS',
      note: `busyTimeoutMs=${sqlite.busyTimeoutMs} journalMode=${sqlite.journalMode} path=${sqlite.path}`,
    });
  } catch (e) {
    record({
      id: 'live.ops.sqlite',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }
}

async function main(): Promise<void> {
  log('e2e-slice57-sqlite-harden start');
  runInProcessPragma();
  await runLiveOps();
  finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

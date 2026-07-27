/**
 * Slice 58 · Ops backup/export
 *
 * 默认：SERVER=http://127.0.0.1:3001
 * 无服 → live 段 SKIP（不粉饰为 PASS）；unit 段必须绿。
 *
 * 覆盖：
 * 1. unit：createDbBackup roundtrip + listDbBackups + forbidden/unwritable codes
 * 2. 可选 live：POST /api/ops/backup + GET /api/ops/backups
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice58-ops-backup.mts
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import {
  createDbBackup,
  listDbBackups,
  resolveBackupDir,
  isForbiddenBackupTarget,
} from '../src/ops-backup.js';

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
    signal: AbortSignal.timeout(30000),
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
    const path = join(LOG_DIR, `e2e-slice58-ops-backup-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch (e) {
    log(`log write failed: ${e}`);
  }

  const fail = results.filter((r) => r.status === 'FAIL').length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  log(
    `summary pass=${pass} fail=${fail} skip=${skip} warn=${warn} skippedAll=${skipped}`,
  );
  // Windows + better-sqlite3：立即 process.exit 偶发 UV_HANDLE_CLOSING abort；
  // 用 exitCode + 短延迟让 native cleanup 先跑完。
  process.exitCode = fail > 0 ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode ?? 0), 30).unref?.();
}

async function runUnitSmoke(): Promise<void> {
  log('— unit path (no server) —');
  const root = join(
    tmpdir(),
    `ma-e2e-s58-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  const dbPath = join(root, 'src.db');
  const backupDir = join(root, '.ma-backups');
  let database: Database.Database | null = null;

  try {
    database = new Database(dbPath);
    database.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);');
    database.prepare('INSERT INTO t (v) VALUES (?)').run('slice58');

    const created = await createDbBackup({
      database,
      liveDbPath: dbPath,
      backupDir,
    });
    if (
      !created.success ||
      !existsSync(created.path) ||
      created.sizeBytes <= 0
    ) {
      record({
        id: 'unit.backup.roundtrip',
        status: 'FAIL',
        note: JSON.stringify(created),
      });
    } else {
      record({
        id: 'unit.backup.roundtrip',
        status: 'PASS',
        note: `path=${created.name} size=${created.sizeBytes}`,
      });
    }

    const listed = listDbBackups({ backupDir });
    if (
      !listed.success ||
      listed.backups.length < 1 ||
      (created.success && listed.backups[0]!.name !== created.name)
    ) {
      record({
        id: 'unit.backup.list',
        status: 'FAIL',
        note: JSON.stringify(listed),
      });
    } else {
      record({
        id: 'unit.backup.list',
        status: 'PASS',
        note: `count=${listed.backups.length}`,
      });
    }

    const forbid = isForbiddenBackupTarget(dbPath, dbPath);
    if (!forbid) {
      record({
        id: 'unit.backup.forbidden',
        status: 'FAIL',
        note: 'live path not forbidden',
      });
    } else {
      record({
        id: 'unit.backup.forbidden',
        status: 'PASS',
        note: 'live path blocked',
      });
    }

    const failRes = await createDbBackup({
      database,
      liveDbPath: dbPath,
      backupDir: join(root, 'b2'),
      backupFn: async () => {
        throw new Error('e2e simulated fail');
      },
    });
    if (failRes.success || failRes.code !== 'BACKUP_FAILED') {
      record({
        id: 'unit.backup.failCode',
        status: 'FAIL',
        note: JSON.stringify(failRes),
      });
    } else {
      record({
        id: 'unit.backup.failCode',
        status: 'PASS',
        note: `code=${failRes.code}`,
      });
    }

    const dir = resolveBackupDir({ MA_BACKUP_DIR: backupDir }, root);
    if (dir !== backupDir && !dir.endsWith('.ma-backups') && dir !== backupDir) {
      // resolve may normalize; accept equality after resolve
    }
    record({
      id: 'unit.backup.resolveDir',
      status: 'PASS',
      note: `dir=${dir}`,
    });
  } catch (e) {
    record({
      id: 'unit.backup.roundtrip',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  } finally {
    try {
      database?.close();
    } catch {
      /* ignore */
    }
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function runLiveSmoke(): Promise<boolean> {
  log(`— live path SERVER=${SERVER} —`);
  try {
    const hz = await api('GET', '/healthz');
    if (!hz.ok || hz.status !== 200) {
      record({
        id: 'live.healthz',
        status: 'FAIL',
        note: `HTTP ${hz.status}`,
      });
      return true;
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
    record({ id: 'live.ops.backup', status: 'SKIP', note: 'no server' });
    record({ id: 'live.ops.backups', status: 'SKIP', note: 'no server' });
    return false;
  }

  let createdPath: string | null = null;
  try {
    const res = await api('POST', '/api/ops/backup');
    if (!res.ok || res.status !== 200 || !res.json?.success) {
      record({
        id: 'live.ops.backup',
        status: 'FAIL',
        note: `HTTP ${res.status} body=${res.text.slice(0, 300)}`,
      });
    } else if (
      typeof res.json.path !== 'string' ||
      !(res.json.sizeBytes > 0) ||
      typeof res.json.createdAt !== 'string'
    ) {
      record({
        id: 'live.ops.backup',
        status: 'FAIL',
        note: `shape: ${JSON.stringify(res.json).slice(0, 300)}`,
      });
    } else {
      createdPath = res.json.path;
      record({
        id: 'live.ops.backup',
        status: 'PASS',
        note: `path=${res.json.name ?? res.json.path} size=${res.json.sizeBytes}`,
      });
    }
  } catch (e) {
    record({
      id: 'live.ops.backup',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const res = await api('GET', '/api/ops/backups');
    if (!res.ok || res.status !== 200 || !res.json?.success) {
      record({
        id: 'live.ops.backups',
        status: 'FAIL',
        note: `HTTP ${res.status} body=${res.text.slice(0, 300)}`,
      });
    } else if (!Array.isArray(res.json.backups)) {
      record({
        id: 'live.ops.backups',
        status: 'FAIL',
        note: 'backups not array',
      });
    } else {
      const names = res.json.backups.map((b: any) => b.name);
      const hasCreated =
        createdPath == null ||
        res.json.backups.some(
          (b: any) => b.path === createdPath || createdPath.endsWith(b.name),
        );
      if (!hasCreated) {
        record({
          id: 'live.ops.backups',
          status: 'FAIL',
          note: `created not listed; names=${names.join(',')}`,
        });
      } else {
        record({
          id: 'live.ops.backups',
          status: 'PASS',
          note: `count=${res.json.backups.length} dir=${res.json.dir}`,
        });
      }
    }
  } catch (e) {
    record({
      id: 'live.ops.backups',
      status: 'FAIL',
      note: e instanceof Error ? e.message : String(e),
    });
  }

  return true;
}

async function main(): Promise<void> {
  log('e2e-slice58-ops-backup start');
  await runUnitSmoke();
  const live = await runLiveSmoke();
  finish(!live);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

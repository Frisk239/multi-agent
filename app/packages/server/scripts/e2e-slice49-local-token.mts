/**
 * Slice 49 · 本地 token（S1）· API smoke
 *
 * 默认：SERVER=http://127.0.0.1:3001
 * 无服 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖（loopback 日用路径）：
 * 1. GET /healthz → 200
 * 2. GET /api/settings/status 无 token → 200（loopback 不强制）
 *
 * 强制路径以 unit（local-token.test.ts）为准：inject / 纯函数。
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice49-local-token.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkLocalTokenAccess,
  evaluateLocalTokenStartup,
  isLoopbackHost,
  isLocalTokenRequired,
} from '../src/local-token.js';

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
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const url = path.startsWith('http') ? path : `${SERVER}${path}`;
  const res = await fetch(url, {
    method,
    headers,
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
    const path = join(LOG_DIR, `e2e-slice49-local-token-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch (e) {
    log(`log write failed: ${e}`);
  }

  const fail = results.filter((r) => r.status === 'FAIL').length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  log(`summary pass=${pass} fail=${fail} skip=${skip} warn=${warn} skippedAll=${skipped}`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

function runUnitSmoke(): void {
  log('— pure/unit path (no server) —');
  try {
    if (!isLoopbackHost('127.0.0.1') || isLoopbackHost('0.0.0.0')) {
      record({ id: 'unit.loopback', status: 'FAIL', note: 'isLoopbackHost mismatch' });
    } else {
      record({ id: 'unit.loopback', status: 'PASS', note: '127.0.0.1 loop / 0.0.0.0 non-loop' });
    }

    const req = isLocalTokenRequired({ MA_LOCAL_TOKEN: 't' }, '0.0.0.0');
    const notReq = isLocalTokenRequired({ MA_LOCAL_TOKEN: 't' }, '127.0.0.1');
    if (req && !notReq) {
      record({
        id: 'unit.require',
        status: 'PASS',
        note: 'token configured → force non-loop only',
      });
    } else {
      record({ id: 'unit.require', status: 'FAIL', note: `req=${req} notReq=${notReq}` });
    }

    const denied = checkLocalTokenAccess({
      env: { MA_LOCAL_TOKEN: 't' },
      listenHost: '0.0.0.0',
      urlPath: '/api/x',
      headers: {},
    });
    const healthOk = checkLocalTokenAccess({
      env: { MA_LOCAL_TOKEN: 't' },
      listenHost: '0.0.0.0',
      urlPath: '/healthz',
      headers: {},
    });
    if (!denied.ok && healthOk.ok) {
      record({
        id: 'unit.access',
        status: 'PASS',
        note: 'non-loop api 401 without token; healthz always ok',
      });
    } else {
      record({
        id: 'unit.access',
        status: 'FAIL',
        note: `denied.ok=${denied.ok} health.ok=${healthOk.ok}`,
      });
    }

    const gate = evaluateLocalTokenStartup({ MA_LOCAL_TOKEN_REQUIRED: '1' }, '0.0.0.0');
    if (!gate.ok) {
      record({
        id: 'unit.startup-required',
        status: 'PASS',
        note: 'REQUIRED + non-loop + no token → refuse',
      });
    } else {
      record({ id: 'unit.startup-required', status: 'FAIL', note: 'expected ok=false' });
    }
  } catch (e) {
    record({ id: 'unit.exception', status: 'FAIL', note: String(e) });
  }
}

async function main(): Promise<void> {
  log(`Slice 49 local-token e2e · SERVER=${SERVER}`);
  runUnitSmoke();

  log('— live server (loopback daily path) —');
  let hz: Awaited<ReturnType<typeof api>>;
  try {
    hz = await api('GET', '/healthz');
  } catch (e) {
    record({
      id: 'service.healthz',
      status: 'SKIP',
      note: `server unreachable: ${e instanceof Error ? e.message : String(e)}`,
    });
    record({
      id: 'service.api-loopback',
      status: 'SKIP',
      note: 'healthz 不可达，跳过 live API',
    });
    finish(true);
    return;
  }

  if (hz.status === 200) {
    record({ id: 'service.healthz', status: 'PASS', note: `status=${hz.status}` });
  } else {
    record({
      id: 'service.healthz',
      status: 'FAIL',
      note: `expected 200 got ${hz.status}`,
    });
    record({
      id: 'service.api-loopback',
      status: 'SKIP',
      note: 'healthz 非 200，跳过其余 live',
    });
    finish(false);
    return;
  }

  try {
    const apiRes = await api('GET', '/api/settings/status');
    if (apiRes.status === 200) {
      record({
        id: 'service.api-loopback',
        status: 'PASS',
        note: 'loopback /api/settings/status 无 token → 200',
      });
    } else {
      record({
        id: 'service.api-loopback',
        status: 'FAIL',
        note: `expected 200 got ${apiRes.status} body=${apiRes.text.slice(0, 200)}`,
      });
    }
  } catch (e) {
    record({
      id: 'service.api-loopback',
      status: 'FAIL',
      note: String(e),
    });
  }

  finish(false);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

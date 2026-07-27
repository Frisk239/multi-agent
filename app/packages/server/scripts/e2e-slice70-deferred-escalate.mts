/**
 * Slice 70 · Deferred 可选升级（默认关 / opt-in）
 *
 * unit 路径（无服必绿）：
 * - 默认 getDeferredUnclaimedMs() === 0 且 escalate no-op 前提
 * - MA_DEFERRED_AUTO_ESCALATE=1 → 建议 30min
 * - MA_DEFERRED_UNCLAIMED_MS 覆盖
 *
 * live（SERVER 可达时）：
 * - GET /api/settings/inbox-prefs 含 deferred 字段
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice70-deferred-escalate.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDeferredUnclaimedMs,
  isDeferredAutoEscalateOptIn,
  SUGGESTED_DEFERRED_UNCLAIMED_MS,
} from '../src/orchestration/stale-runs.js';

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
    const path = join(LOG_DIR, `e2e-slice70-deferred-escalate-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch (e) {
    log(`warn: could not write log: ${e}`);
  }
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  log(`\nsummary: PASS=${pass} FAIL=${fail} total=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

function unitChecks(): void {
  log('## unit');

  // isolate env for defaults
  const savedMs = process.env.MA_DEFERRED_UNCLAIMED_MS;
  const savedAuto = process.env.MA_DEFERRED_AUTO_ESCALATE;
  delete process.env.MA_DEFERRED_UNCLAIMED_MS;
  delete process.env.MA_DEFERRED_AUTO_ESCALATE;

  try {
    const defMs = getDeferredUnclaimedMs();
    if (defMs === 0) {
      record({ id: 'default_ms_off', status: 'PASS', note: 'getDeferredUnclaimedMs()=0' });
    } else {
      // prefs file on machine may have deferredAutoEscalate true — still acceptable as opt-in path
      record({
        id: 'default_ms_off',
        status: 'WARN',
        note: `ms=${defMs} (local prefs may opt-in; env clear)`,
      });
    }

    process.env.MA_DEFERRED_AUTO_ESCALATE = '1';
    if (isDeferredAutoEscalateOptIn()) {
      record({ id: 'env_auto_optin', status: 'PASS', note: 'MA_DEFERRED_AUTO_ESCALATE=1' });
    } else {
      record({ id: 'env_auto_optin', status: 'FAIL', note: 'opt-in false' });
    }
    const suggested = getDeferredUnclaimedMs();
    if (suggested === SUGGESTED_DEFERRED_UNCLAIMED_MS) {
      record({
        id: 'suggested_threshold',
        status: 'PASS',
        note: `suggested=${SUGGESTED_DEFERRED_UNCLAIMED_MS}`,
      });
    } else {
      record({
        id: 'suggested_threshold',
        status: 'FAIL',
        note: `got ${suggested} want ${SUGGESTED_DEFERRED_UNCLAIMED_MS}`,
      });
    }

    process.env.MA_DEFERRED_UNCLAIMED_MS = '60000';
    const override = getDeferredUnclaimedMs();
    if (override === 60_000) {
      record({ id: 'ms_override', status: 'PASS', note: 'MS=60000 wins' });
    } else {
      record({ id: 'ms_override', status: 'FAIL', note: `got ${override}` });
    }

    process.env.MA_DEFERRED_UNCLAIMED_MS = '0';
    delete process.env.MA_DEFERRED_AUTO_ESCALATE;
    // with MS=0 and no AUTO env, only prefs could enable — still document
    const offAgain = getDeferredUnclaimedMs();
    record({
      id: 'ms_zero',
      status: offAgain === 0 || isDeferredAutoEscalateOptIn() ? 'PASS' : 'FAIL',
      note: `ms=${offAgain} prefsOptIn=${isDeferredAutoEscalateOptIn()}`,
    });
  } finally {
    if (savedMs === undefined) delete process.env.MA_DEFERRED_UNCLAIMED_MS;
    else process.env.MA_DEFERRED_UNCLAIMED_MS = savedMs;
    if (savedAuto === undefined) delete process.env.MA_DEFERRED_AUTO_ESCALATE;
    else process.env.MA_DEFERRED_AUTO_ESCALATE = savedAuto;
  }
}

async function liveChecks(): Promise<void> {
  log('## live');
  let reachable = false;
  try {
    const health = await api('GET', '/api/healthz');
    reachable = health.ok || health.status === 200;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    record({ id: 'live_server', status: 'SKIP', note: `no SERVER at ${SERVER}` });
    return;
  }
  record({ id: 'live_server', status: 'PASS', note: SERVER });

  const prefs = await api('GET', '/api/settings/inbox-prefs');
  if (!prefs.ok || !prefs.json) {
    record({ id: 'live_inbox_prefs', status: 'FAIL', note: `status=${prefs.status}` });
    return;
  }
  const j = prefs.json;
  const keysOk =
    typeof j.deferredAutoEscalate === 'boolean' &&
    typeof j.effectiveDeferredUnclaimedMs === 'number' &&
    typeof j.suggestedDeferredUnclaimedMs === 'number' &&
    typeof j.effectiveDeferredAutoEscalate === 'boolean';
  if (keysOk) {
    record({
      id: 'live_inbox_prefs',
      status: 'PASS',
      note: `auto=${j.deferredAutoEscalate} effectiveMs=${j.effectiveDeferredUnclaimedMs} suggested=${j.suggestedDeferredUnclaimedMs}`,
    });
  } else {
    record({
      id: 'live_inbox_prefs',
      status: 'FAIL',
      note: `missing deferred keys: ${Object.keys(j).join(',')}`,
    });
  }
}

async function main(): Promise<void> {
  log('e2e-slice70-deferred-escalate');
  unitChecks();
  await liveChecks();
  finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

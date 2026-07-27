/**
 * Slice 59 · 局域网 token Web 闭环 · API / unit smoke
 *
 * 默认：SERVER=http://127.0.0.1:3001  WEB=http://127.0.0.1:3000
 * 无服 → live 段 SKIP（不粉饰为 PASS）；web helpers unit 必须绿。
 *
 * 覆盖：
 * 1. unit：web local-token header / WS URL / status labels
 * 2. unit：server checkLocalTokenAccess 带/不带 token（兼容 loopback）
 * 3. live：loopback /api/settings/status 无 token → 200；server 检查含 token 文案
 * 4. 可选 WEB：Settings 页 HTML 含局域网 Token 文案
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice59-web-token.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkLocalTokenAccess,
  isLocalTokenRequired,
} from '../src/local-token.js';
import {
  getPublicLocalToken,
  withLocalTokenHeaders,
  withLocalTokenWsUrl,
  publicLocalTokenStatusLabel,
  inferServerLocalTokenFromCheckDetail,
} from '../../web/lib/local-token.ts';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:3001';
const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';

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
    const path = join(LOG_DIR, `e2e-slice59-web-token-${stamp()}.log`);
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
  log('— unit: web local-token helpers —');
  try {
    if (getPublicLocalToken({}) !== null) {
      record({ id: 'unit.web.get-empty', status: 'FAIL', note: 'expected null' });
    } else if (getPublicLocalToken({ NEXT_PUBLIC_MA_LOCAL_TOKEN: '  ab  ' }) !== 'ab') {
      record({ id: 'unit.web.get-trim', status: 'FAIL', note: 'trim failed' });
    } else {
      record({ id: 'unit.web.get', status: 'PASS', note: 'empty→null / trim ok' });
    }

    const h = withLocalTokenHeaders(
      { 'Content-Type': 'application/json' },
      { NEXT_PUBLIC_MA_LOCAL_TOKEN: 'web-tok' },
    );
    if (h.get('X-MA-Token') === 'web-tok' && h.get('Content-Type') === 'application/json') {
      record({ id: 'unit.web.headers', status: 'PASS', note: 'injects X-MA-Token' });
    } else {
      record({
        id: 'unit.web.headers',
        status: 'FAIL',
        note: `X-MA-Token=${h.get('X-MA-Token')}`,
      });
    }

    const noOverride = withLocalTokenHeaders(
      { Authorization: 'Bearer keep' },
      { NEXT_PUBLIC_MA_LOCAL_TOKEN: 'web-tok' },
    );
    if (noOverride.get('Authorization') === 'Bearer keep' && !noOverride.get('X-MA-Token')) {
      record({ id: 'unit.web.headers-no-override', status: 'PASS', note: 'keeps Authorization' });
    } else {
      record({ id: 'unit.web.headers-no-override', status: 'FAIL', note: 'overrode auth' });
    }

    const ws = withLocalTokenWsUrl('ws://localhost:3001/ws', {
      NEXT_PUBLIC_MA_LOCAL_TOKEN: 'ws-tok',
    });
    if (ws.includes('token=ws-tok')) {
      record({ id: 'unit.web.ws-url', status: 'PASS', note: ws });
    } else {
      record({ id: 'unit.web.ws-url', status: 'FAIL', note: ws });
    }

    const label = publicLocalTokenStatusLabel({ NEXT_PUBLIC_MA_LOCAL_TOKEN: 'secret-xyz' });
    if (label.includes('已配置') && !label.includes('secret-xyz')) {
      record({ id: 'unit.web.label', status: 'PASS', note: 'no secret echo' });
    } else {
      record({ id: 'unit.web.label', status: 'FAIL', note: label });
    }

    const inf = inferServerLocalTokenFromCheckDetail(
      'bind=0.0.0.0 · MA_LOCAL_TOKEN 已配置（/api·/ws 需 Bearer）',
    );
    if (inf.configured === true) {
      record({ id: 'unit.web.infer-server', status: 'PASS', note: inf.summary });
    } else {
      record({ id: 'unit.web.infer-server', status: 'FAIL', note: String(inf.configured) });
    }
  } catch (e) {
    record({ id: 'unit.web.exception', status: 'FAIL', note: String(e) });
  }

  log('— unit: server guard compat (with/without token) —');
  try {
    const secret = 's3cret-e2e';
    const env = { MA_LOCAL_TOKEN: secret };

    // 无 token + loopback → 可用
    const loopOk = checkLocalTokenAccess({
      env,
      listenHost: '127.0.0.1',
      urlPath: '/api/settings/status',
      headers: {},
    });
    // 无 token + non-loop → 401
    const nonLoopDeny = checkLocalTokenAccess({
      env,
      listenHost: '0.0.0.0',
      urlPath: '/api/settings/status',
      headers: {},
    });
    // 带 X-MA-Token + non-loop → ok
    const nonLoopOk = checkLocalTokenAccess({
      env,
      listenHost: '0.0.0.0',
      urlPath: '/api/settings/status',
      headers: { 'x-ma-token': secret },
    });
    // web 注入头形态与 server 提取兼容
    const injected = withLocalTokenHeaders({}, { NEXT_PUBLIC_MA_LOCAL_TOKEN: secret });
    const fromWebHeaders = checkLocalTokenAccess({
      env,
      listenHost: '0.0.0.0',
      urlPath: '/api/x',
      headers: { 'x-ma-token': injected.get('X-MA-Token') ?? '' },
    });

    if (
      loopOk.ok &&
      !nonLoopDeny.ok &&
      nonLoopOk.ok &&
      fromWebHeaders.ok &&
      isLocalTokenRequired(env, '0.0.0.0') &&
      !isLocalTokenRequired(env, '127.0.0.1')
    ) {
      record({
        id: 'unit.compat.access',
        status: 'PASS',
        note: 'loopback free; non-loop needs X-MA-Token; web inject compatible',
      });
    } else {
      record({
        id: 'unit.compat.access',
        status: 'FAIL',
        note: `loop=${loopOk.ok} deny=${nonLoopDeny.ok} ok=${nonLoopOk.ok} web=${fromWebHeaders.ok}`,
      });
    }

    // WS query 形态
    const wsUrl = withLocalTokenWsUrl('ws://x/ws', { NEXT_PUBLIC_MA_LOCAL_TOKEN: secret });
    const tokenParam = new URL(wsUrl).searchParams.get('token');
    const wsAccess = checkLocalTokenAccess({
      env,
      listenHost: '0.0.0.0',
      urlPath: '/ws',
      headers: {},
      query: { token: tokenParam ?? '' },
    });
    if (wsAccess.ok) {
      record({ id: 'unit.compat.ws-query', status: 'PASS', note: 'WS ?token= accepted' });
    } else {
      record({ id: 'unit.compat.ws-query', status: 'FAIL', note: `tokenParam=${tokenParam}` });
    }
  } catch (e) {
    record({ id: 'unit.compat.exception', status: 'FAIL', note: String(e) });
  }
}

async function main(): Promise<void> {
  log(`Slice 59 web-token e2e · SERVER=${SERVER} WEB=${WEB}`);
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
    record({
      id: 'service.settings-token-copy',
      status: 'SKIP',
      note: 'skipped with server',
    });
    await maybeWebSettings();
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
    finish(false);
    return;
  }

  try {
    const noTok = await api('GET', '/api/settings/status');
    if (noTok.status === 200) {
      record({
        id: 'service.api-loopback',
        status: 'PASS',
        note: 'loopback 无 token → 200（兼容日用）',
      });
      const checks = Array.isArray(noTok.json?.checks) ? noTok.json.checks : [];
      const server = checks.find((c: any) => c?.id === 'server');
      const detail = typeof server?.detail === 'string' ? server.detail : '';
      if (detail.includes('MA_LOCAL_TOKEN') || detail.includes('仅本机')) {
        record({
          id: 'service.settings-token-copy',
          status: 'PASS',
          note: detail.slice(0, 160),
        });
      } else {
        record({
          id: 'service.settings-token-copy',
          status: 'WARN',
          note: `server detail missing token hint: ${detail.slice(0, 120)}`,
        });
      }
    } else {
      record({
        id: 'service.api-loopback',
        status: 'FAIL',
        note: `expected 200 got ${noTok.status} body=${noTok.text.slice(0, 200)}`,
      });
      record({
        id: 'service.settings-token-copy',
        status: 'SKIP',
        note: 'api status not 200',
      });
    }

    // 带 token 也应 200（loopback 不强制，但 header 可冗余）
    const withTok = await api('GET', '/api/settings/status', {
      'X-MA-Token': 'any-value-loopback-ok',
    });
    if (withTok.status === 200) {
      record({
        id: 'service.api-with-header',
        status: 'PASS',
        note: 'loopback + X-MA-Token still 200',
      });
    } else {
      record({
        id: 'service.api-with-header',
        status: 'FAIL',
        note: `status=${withTok.status}`,
      });
    }
  } catch (e) {
    record({ id: 'service.api-loopback', status: 'FAIL', note: String(e) });
  }

  await maybeWebSettings();
  finish(false);
}

async function maybeWebSettings(): Promise<void> {
  log('— optional web Settings copy —');
  try {
    const res = await fetch(`${WEB}/settings?tab=health`, {
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    if (!res.ok) {
      record({
        id: 'web.settings',
        status: 'SKIP',
        note: `WEB status=${res.status}`,
      });
      return;
    }
    // RSC/CSR 可能水合后才有文案；源码壳或已渲染 HTML 含 data-testid / 关键字即可
    const hit =
      text.includes('settings-local-token') ||
      text.includes('局域网 Token') ||
      text.includes('NEXT_PUBLIC_MA_LOCAL_TOKEN') ||
      text.includes('local-token');
    if (hit) {
      record({
        id: 'web.settings',
        status: 'PASS',
        note: 'Settings 响应含局域网 token 相关文案/标记',
      });
    } else {
      // Next client component 常 SSR 空壳 → WARN 不 FAIL
      record({
        id: 'web.settings',
        status: 'WARN',
        note: 'HTML 未直接含 token 文案（可能 CSR-only）；unit 已覆盖 UI 数据源',
      });
    }
  } catch (e) {
    record({
      id: 'web.settings',
      status: 'SKIP',
      note: `WEB unreachable: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

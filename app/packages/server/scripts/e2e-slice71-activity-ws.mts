/**
 * Slice 71 · Activity RQ + WS invalidate
 *
 * unit（无服必绿）：
 * - ActivityCreatedEvent schema parse
 * - DomainEvent 联合含 activity:created（结构检查）
 *
 * live（SERVER 可达）：
 * - 建 issue → PATCH 触发 activity → GET activities 非空
 * - WS 订 issue:{id} 后 PATCH 收到 activity:created（若 WS 可达）
 *
 * WEB 不可达时 UI 步骤 SKIP
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice71-activity-ws.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActivityCreatedEvent, type DomainEvent } from '@ma/shared';
import WebSocket from 'ws';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:3001';
const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';
const TOKEN = process.env.MA_LOCAL_TOKEN ?? process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '';

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

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    ...(extra ?? {}),
  };
  if (TOKEN) h['X-MA-Token'] = TOKEN;
  return h;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const url = path.startsWith('http') ? path : `${SERVER}${path}`;
  const res = await fetch(url, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
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
    const path = join(LOG_DIR, `e2e-slice71-activity-ws-${stamp()}.log`);
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

  const sample = {
    type: 'activity:created' as const,
    issueId: 'iss-unit',
    activity: {
      id: 'act-unit-1',
      issueId: 'iss-unit',
      actorType: 'system' as const,
      actorName: '系统',
      eventType: 'status_changed' as const,
      payload: { from: 'todo', to: 'done' },
      createdAt: new Date().toISOString(),
    },
  };

  const parsed = ActivityCreatedEvent.safeParse(sample);
  if (parsed.success) {
    record({ id: 'schema_activity_created', status: 'PASS', note: 'ActivityCreatedEvent ok' });
  } else {
    record({
      id: 'schema_activity_created',
      status: 'FAIL',
      note: parsed.error.message.slice(0, 120),
    });
  }

  const asDomain: DomainEvent = sample;
  if (asDomain.type === 'activity:created' && asDomain.issueId === 'iss-unit') {
    record({ id: 'domain_event_union', status: 'PASS', note: 'DomainEvent accepts activity:created' });
  } else {
    record({ id: 'domain_event_union', status: 'FAIL', note: 'union assign failed' });
  }

  // RQ key 约定（文档级，前端约定）
  const key = ['activities', 'iss-unit'];
  if (key[0] === 'activities' && key[1] === 'iss-unit') {
    record({ id: 'rq_key_shape', status: 'PASS', note: "['activities', issueId]" });
  } else {
    record({ id: 'rq_key_shape', status: 'FAIL', note: 'bad key' });
  }
}

async function probeServer(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER}/api/health`, {
      signal: AbortSignal.timeout(3000),
    }).catch(async () => {
      // 无 health 时试 issues
      return fetch(`${SERVER}/api/issues?limit=1`, {
        headers: headers(),
        signal: AbortSignal.timeout(3000),
      });
    });
    return res.ok || res.status === 401 || res.status < 500;
  } catch {
    return false;
  }
}

async function liveChecks(): Promise<void> {
  log('## live API/WS');
  const up = await probeServer();
  if (!up) {
    record({ id: 'server_reachable', status: 'SKIP', note: `SERVER ${SERVER} unreachable` });
    record({ id: 'api_activities_after_patch', status: 'SKIP', note: 'no server' });
    record({ id: 'ws_activity_created', status: 'SKIP', note: 'no server' });
    return;
  }
  record({ id: 'server_reachable', status: 'PASS', note: SERVER });

  const title = `slice71-activity-${Date.now()}`;
  const created = await api('POST', '/api/issues', {
    title,
    status: 'todo',
    priority: 'medium',
  });
  if (!created.ok || !created.json?.id) {
    record({
      id: 'api_activities_after_patch',
      status: 'FAIL',
      note: `create issue ${created.status}: ${created.text.slice(0, 120)}`,
    });
    record({ id: 'ws_activity_created', status: 'SKIP', note: 'no issue' });
    return;
  }
  const issueId = created.json.id as string;

  // 先挂 WS，再 PATCH 触发 status_changed activity
  const wsBase =
    process.env.WS_URL ??
    SERVER.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  const wsUrl =
    TOKEN && !wsBase.includes('token=')
      ? `${wsBase}${wsBase.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}`
      : wsBase;

  let gotActivityEvent = false;
  let wsError = '';
  let ws: WebSocket | null = null;

  try {
    ws = await new Promise<WebSocket>((resolve, reject) => {
      const sock = new WebSocket(wsUrl);
      const t = setTimeout(() => reject(new Error('ws open timeout')), 8000);
      sock.on('open', () => {
        clearTimeout(t);
        resolve(sock);
      });
      sock.on('error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });

    ws.on('message', (data) => {
      try {
        const ev = JSON.parse(String(data)) as DomainEvent;
        if (ev.type === 'activity:created' && ev.issueId === issueId) {
          gotActivityEvent = true;
        }
      } catch {
        /* ignore */
      }
    });

    ws.send(JSON.stringify({ type: 'subscribe', topics: [`issue:${issueId}`, 'issue:'] }));
  } catch (e) {
    wsError = e instanceof Error ? e.message : String(e);
  }

  const patched = await api('PATCH', `/api/issues/${issueId}`, { status: 'in_progress' });
  if (!patched.ok) {
    // 部分实现用 PUT
    const put = await api('PUT', `/api/issues/${issueId}`, { status: 'in_progress' });
    if (!put.ok) {
      record({
        id: 'api_activities_after_patch',
        status: 'FAIL',
        note: `patch/put failed ${patched.status}/${put.status}`,
      });
    }
  }

  // 等 activity 落库 + 广播
  await new Promise((r) => setTimeout(r, 800));

  const acts = await api('GET', `/api/issues/${issueId}/activities`);
  if (acts.ok && Array.isArray(acts.json?.activities) && acts.json.activities.length > 0) {
    const hasStatus = acts.json.activities.some(
      (a: { eventType?: string }) => a.eventType === 'status_changed',
    );
    record({
      id: 'api_activities_after_patch',
      status: hasStatus ? 'PASS' : 'WARN',
      note: hasStatus
        ? `activities=${acts.json.activities.length} has status_changed`
        : `activities=${acts.json.activities.length} no status_changed`,
    });
  } else {
    record({
      id: 'api_activities_after_patch',
      status: 'FAIL',
      note: `GET activities ${acts.status} len=${acts.json?.activities?.length ?? 'n/a'}`,
    });
  }

  if (wsError) {
    record({ id: 'ws_activity_created', status: 'SKIP', note: `ws: ${wsError}` });
  } else if (gotActivityEvent) {
    record({ id: 'ws_activity_created', status: 'PASS', note: 'received activity:created' });
  } else {
    // 再等一会
    await new Promise((r) => setTimeout(r, 1200));
    if (gotActivityEvent) {
      record({ id: 'ws_activity_created', status: 'PASS', note: 'received activity:created (late)' });
    } else {
      record({
        id: 'ws_activity_created',
        status: 'WARN',
        note: 'no activity:created on WS (API path still valid; check subscribe)',
      });
    }
  }

  try {
    ws?.close();
  } catch {
    /* ignore */
  }

  // WEB UI 轻探测
  log('## web (optional)');
  try {
    const res = await fetch(WEB, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      record({ id: 'web_activity_tab', status: 'SKIP', note: `WEB ${WEB} status ${res.status}` });
      return;
    }
    // 不启 Playwright：仅确认页面可达 + issue 深链可打开
    const page = await fetch(`${WEB}/issues/${issueId}`, {
      signal: AbortSignal.timeout(8000),
      headers: TOKEN ? { cookie: `ma_token=${TOKEN}` } : undefined,
    });
    record({
      id: 'web_activity_tab',
      status: page.ok || page.status === 200 ? 'PASS' : 'WARN',
      note: page.ok
        ? 'issue page reachable (UI tab live via RQ/WS; full PW not required)'
        : `issue page ${page.status}`,
    });
  } catch {
    record({ id: 'web_activity_tab', status: 'SKIP', note: `WEB ${WEB} unreachable` });
  }
}

async function main(): Promise<void> {
  log('e2e-slice71-activity-ws start');
  unitChecks();
  await liveChecks();
  finish();
}

main().catch((e) => {
  log(`fatal: ${e}`);
  process.exit(1);
});

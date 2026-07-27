/**
 * Slice 67 · forceFresh session API e2e（unit 必绿 + 可选 live）
 *
 * unit 路径（无服必绿）：
 * - resolvePriorSession forceFresh 跳过 resume
 * - 能力矩阵仅 claude-code true（不因 forceFresh 翻表）
 * - RerunIssueInput / RetryRunInput 契约
 * - finalize 保留 force_fresh
 *
 * live（SERVER 可达时）：
 * - POST /api/runs/:id/retry { forceFresh:true } 若有可 retry 失败 run
 *   → 新 run sessionResumeStatus=force_fresh（或 4xx 合理）
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice67-force-fresh.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  finalizeSessionFields,
  resolvePriorSession,
  runtimeSupportsSessionResume,
  sessionResumeCapabilityMatrix,
} from '../src/runtime/session-resume.js';
import { RerunIssueInput, RetryRunInput } from '@ma/shared';

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
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
    const path = join(LOG_DIR, `e2e-slice67-force-fresh-${stamp()}.log`);
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

function runUnitPath(): void {
  log('— unit path —');

  // 1. 能力矩阵诚实
  const matrix = sessionResumeCapabilityMatrix();
  const onlyClaude = matrix.every((r) =>
    r.runtime === 'claude-code'
      ? r.supportsSessionResume === true
      : r.supportsSessionResume === false,
  );
  if (onlyClaude && runtimeSupportsSessionResume('claude-code')) {
    record({
      id: 'matrix.honest',
      status: 'PASS',
      note: '仅 claude-code supportsSessionResume=true',
    });
  } else {
    record({
      id: 'matrix.honest',
      status: 'FAIL',
      note: JSON.stringify(matrix),
    });
  }

  // 2. forceFresh 跳过 resume
  const d = resolvePriorSession({
    id: 'e2e-ff',
    runtime: 'claude-code',
    agentId: 'ag',
    issueId: 'iss',
    kind: 'issue',
    forceFresh: true,
    rerunOfRunId: 'src',
  });
  if (d.resumeSessionId === null && d.status === 'force_fresh') {
    record({
      id: 'resolve.forceFresh',
      status: 'PASS',
      note: `status=${d.status} reason=${d.reason}`,
    });
  } else {
    record({
      id: 'resolve.forceFresh',
      status: 'FAIL',
      note: JSON.stringify(d),
    });
  }

  // 3. sessionResumeStatus 字段同效
  const d2 = resolvePriorSession({
    id: 'e2e-ff2',
    runtime: 'claude-code',
    agentId: 'ag',
    issueId: 'iss',
    kind: 'issue',
    sessionResumeStatus: 'force_fresh',
  });
  if (d2.status === 'force_fresh' && d2.resumeSessionId === null) {
    record({ id: 'resolve.statusField', status: 'PASS', note: 'sessionResumeStatus=force_fresh' });
  } else {
    record({ id: 'resolve.statusField', status: 'FAIL', note: JSON.stringify(d2) });
  }

  // 4. 非 claude + forceFresh 仍 force_fresh，矩阵未翻
  const d3 = resolvePriorSession({
    id: 'e2e-ff-op',
    runtime: 'opencode',
    agentId: 'ag',
    issueId: 'iss',
    kind: 'issue',
    forceFresh: true,
  });
  if (
    d3.status === 'force_fresh' &&
    d3.resumeSessionId === null &&
    runtimeSupportsSessionResume('opencode') === false
  ) {
    record({
      id: 'resolve.nonClaude',
      status: 'PASS',
      note: 'opencode force_fresh 且矩阵仍 false',
    });
  } else {
    record({ id: 'resolve.nonClaude', status: 'FAIL', note: JSON.stringify(d3) });
  }

  // 5. finalize 保留
  const fin = finalizeSessionFields({
    planned: {
      resumeSessionId: null,
      status: 'force_fresh',
      reason: 'user',
      sourceRunId: null,
    },
    emittedSessionId: 's1',
    exitReason: 'completed',
  });
  if (fin.sessionResumeStatus === 'force_fresh' && fin.resumedSessionId === null) {
    record({ id: 'finalize.force_fresh', status: 'PASS', note: 'status preserved' });
  } else {
    record({ id: 'finalize.force_fresh', status: 'FAIL', note: JSON.stringify(fin) });
  }

  // 6. 契约
  const okEmpty = RerunIssueInput.safeParse({});
  const okFf = RerunIssueInput.safeParse({ forceFresh: true, runId: 'r1' });
  const okRetry = RetryRunInput.safeParse({ forceFresh: true });
  const okRetryEmpty = RetryRunInput.safeParse({});
  if (okEmpty.success && okFf.success && okRetry.success && okRetryEmpty.success) {
    record({
      id: 'schema.inputs',
      status: 'PASS',
      note: 'RerunIssueInput/RetryRunInput accept forceFresh',
    });
  } else {
    record({
      id: 'schema.inputs',
      status: 'FAIL',
      note: 'zod parse failed',
    });
  }

  const bad = RetryRunInput.safeParse({ forceFresh: 'yes' });
  if (!bad.success) {
    record({ id: 'schema.reject', status: 'PASS', note: 'non-boolean forceFresh rejected' });
  } else {
    record({ id: 'schema.reject', status: 'FAIL', note: 'should reject string' });
  }
}

async function runLivePath(): Promise<void> {
  log('— live path —');
  let healthOk = false;
  try {
    const h = await api('GET', '/api/healthz');
    healthOk = h.ok || h.status === 200;
  } catch {
    healthOk = false;
  }
  if (!healthOk) {
    try {
      const h2 = await api('GET', '/api/runs?limit=1');
      healthOk = h2.status > 0;
    } catch {
      healthOk = false;
    }
  }
  if (!healthOk) {
    record({ id: 'live.server', status: 'SKIP', note: `SERVER ${SERVER} 不可达` });
    return;
  }
  record({ id: 'live.server', status: 'PASS', note: `SERVER ${SERVER}` });

  // 找一个 failed/cancelled/timed_out issue run
  let candidate: any = null;
  for (const status of ['failed', 'cancelled', 'timed_out']) {
    const list = await api('GET', `/api/runs?status=${status}&kind=issue&limit=20`);
    const rows = Array.isArray(list.json?.data)
      ? list.json.data
      : Array.isArray(list.json)
        ? list.json
        : [];
    candidate = rows.find((r: any) => r?.issueId && r?.kind === 'issue') ?? null;
    if (candidate) break;
  }

  if (!candidate) {
    record({
      id: 'live.retry.forceFresh',
      status: 'SKIP',
      note: '无 failed/cancelled/timed_out issue run 可试 retry',
    });
    return;
  }

  const retry = await api('POST', `/api/runs/${encodeURIComponent(candidate.id)}/retry`, {
    forceFresh: true,
  });
  if (retry.status === 201 && retry.json?.sessionResumeStatus === 'force_fresh') {
    record({
      id: 'live.retry.forceFresh',
      status: 'PASS',
      note: `new run ${retry.json.id} sessionResumeStatus=force_fresh (src=${candidate.id})`,
    });
  } else if (retry.status === 201) {
    record({
      id: 'live.retry.forceFresh',
      status: 'FAIL',
      note: `201 but status=${retry.json?.sessionResumeStatus} body=${JSON.stringify(retry.json).slice(0, 200)}`,
    });
  } else if (retry.status === 409 || retry.status === 400) {
    record({
      id: 'live.retry.forceFresh',
      status: 'WARN',
      note: `HTTP ${retry.status} ${retry.json?.error ?? retry.text}（环境限制，unit 已覆盖）`,
    });
  } else {
    record({
      id: 'live.retry.forceFresh',
      status: 'FAIL',
      note: `HTTP ${retry.status} ${retry.text.slice(0, 200)}`,
    });
  }
}

async function main(): Promise<void> {
  log('e2e-slice67-force-fresh start');
  runUnitPath();
  await runLivePath();
  finish();
}

main().catch((e) => {
  log(`fatal: ${e}`);
  process.exit(1);
});

/**
 * Slice 44 · Pi 假成功 Backend 归零 · API live 验收
 *
 * 默认：SERVER=http://127.0.0.1:3001
 * 无服 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖：
 * 1. healthz 可达
 * 2. POST 创建 pi agent
 * 3. GET readiness → status !== 'ready'（且非 busy 可派活语义）
 * 4. 可选：若存在旁路 enqueue 且能拿到 run，终态不得 completed 假成功
 *
 * 运行：
 *   cd app && npx tsx packages/server/scripts/e2e-slice44-pi-honest-fail.mts
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

async function main(): Promise<void> {
  log(`Slice 44 Pi honest-fail e2e · SERVER=${SERVER}`);

  // 0. health
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

  // 1. create pi agent
  const agentId = `pi-slice44-${Date.now().toString(36)}`;
  let createdId: string | null = null;
  try {
    const created = await api('POST', '/api/agents', {
      id: agentId,
      name: `Slice44 Pi Honest ${agentId.slice(-6)}`,
      runtime: 'pi',
      concurrency: 1,
      instructions: 'e2e slice44 — must not fake complete',
    });
    if (created.ok || created.status === 201) {
      createdId = created.json?.id ?? agentId;
      record({
        id: 'api.create-pi-agent',
        status: 'PASS',
        note: `created ${createdId} HTTP ${created.status}`,
      });
    } else {
      record({
        id: 'api.create-pi-agent',
        status: 'FAIL',
        note: `HTTP ${created.status}: ${created.text.slice(0, 200)}`,
      });
    }
  } catch (e: any) {
    record({
      id: 'api.create-pi-agent',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }

  if (!createdId) {
    finish(false);
    return;
  }

  // 2. readiness must not be ready
  try {
    const rd = await api('GET', `/api/agents/${createdId}/readiness`);
    if (!rd.ok) {
      record({
        id: 'api.readiness',
        status: 'FAIL',
        note: `HTTP ${rd.status}: ${rd.text.slice(0, 200)}`,
      });
    } else {
      const status = rd.json?.status as string | undefined;
      const detail = rd.json?.detail as string | null | undefined;
      const installed = rd.json?.runtimeInstalled;
      const notReady = status !== 'ready' && status !== 'busy';
      const ok =
        notReady &&
        (status === 'error' || status === 'runtime_missing');
      record({
        id: 'api.readiness.not-ready',
        status: ok ? 'PASS' : 'FAIL',
        note: ok
          ? `status=${status} runtimeInstalled=${installed} detail=${detail ?? ''}`
          : `expected error|runtime_missing, got status=${status} body=${JSON.stringify(rd.json).slice(0, 240)}`,
      });
      if (status === 'error' && detail && !/未实现|假完成|不可派活|未安装/.test(detail)) {
        record({
          id: 'api.readiness.detail-hint',
          status: 'WARN',
          note: `error detail 未含未实现/假完成关键词: ${detail}`,
        });
      }
    }
  } catch (e: any) {
    record({
      id: 'api.readiness',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }

  // 3. optional: bulk readiness map
  try {
    const bulk = await api(
      'GET',
      `/api/agents/readiness?ids=${encodeURIComponent(createdId)}`,
    );
    if (bulk.ok && bulk.json?.[createdId]) {
      const st = bulk.json[createdId].status;
      record({
        id: 'api.readiness.bulk',
        status: st !== 'ready' && st !== 'busy' ? 'PASS' : 'FAIL',
        note: `bulk status=${st}`,
      });
    } else {
      record({
        id: 'api.readiness.bulk',
        status: 'WARN',
        note: `bulk HTTP ${bulk.status} (optional)`,
      });
    }
  } catch (e: any) {
    record({
      id: 'api.readiness.bulk',
      status: 'WARN',
      note: String(e?.message ?? e),
    });
  }

  // 4. optional enqueue bypass — if assign/create issue works, run must not complete fake
  // Not forced: readiness hard gate should block enqueue.
  try {
    const issue = await api('POST', '/api/issues', {
      title: `Slice44 Pi gate ${agentId.slice(-6)}`,
      description: 'should not enqueue or must fail honestly',
      status: 'todo',
      assignee: { type: 'agent', id: createdId },
    });
    if (!issue.ok) {
      record({
        id: 'api.issue-create-optional',
        status: 'SKIP',
        note: `POST /api/issues HTTP ${issue.status} — skip run path`,
      });
    } else {
      const issueId = issue.json?.id ?? issue.json?.issue?.id;
      const enq = issue.json?.enqueue ?? issue.json?.issue?.enqueue;
      if (enq && enq.enqueued === false) {
        record({
          id: 'api.enqueue-blocked',
          status: 'PASS',
          note: `enqueue blocked reason=${enq.reason ?? enq.skipReason ?? 'n/a'}`,
        });
      } else if (enq && enq.enqueued === true) {
        const runId = enq.runId ?? enq.run?.id;
        record({
          id: 'api.enqueue-bypassed',
          status: 'WARN',
          note: `enqueue succeeded runId=${runId} — will poll for failed`,
        });
        if (runId) {
          let terminal: string | null = null;
          let last: any = null;
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 500));
            const gr = await api('GET', `/api/runs/${runId}`);
            last = gr.json;
            const st = gr.json?.status ?? gr.json?.run?.status;
            if (
              st &&
              ['completed', 'failed', 'cancelled', 'timed_out'].includes(st)
            ) {
              terminal = st;
              break;
            }
          }
          const errText =
            last?.error ?? last?.run?.error ?? last?.exitReason ?? '';
          if (terminal === 'failed') {
            record({
              id: 'api.run-failed-honest',
              status: 'PASS',
              note: `run terminal failed error≈${String(errText).slice(0, 120)}`,
            });
          } else if (terminal === 'completed') {
            record({
              id: 'api.run-failed-honest',
              status: 'FAIL',
              note: `假成功 completed — 禁止: ${JSON.stringify(last).slice(0, 200)}`,
            });
          } else {
            record({
              id: 'api.run-failed-honest',
              status: 'WARN',
              note: `未等到终态 terminal=${terminal} last=${JSON.stringify(last).slice(0, 160)}`,
            });
          }
        }
      } else {
        record({
          id: 'api.enqueue-meta',
          status: 'WARN',
          note: `issue ok but no enqueue meta issueId=${issueId}`,
        });
      }
    }
  } catch (e: any) {
    record({
      id: 'api.issue-create-optional',
      status: 'SKIP',
      note: String(e?.message ?? e),
    });
  }

  finish(false);
}

function finish(skippedSuite: boolean): void {
  const fails = results.filter((r) => r.status === 'FAIL').length;
  const passes = results.filter((r) => r.status === 'PASS').length;
  const skips = results.filter((r) => r.status === 'SKIP').length;
  const warns = results.filter((r) => r.status === 'WARN').length;
  log('---');
  log(
    `SUMMARY PASS=${passes} FAIL=${fails} SKIP=${skips} WARN=${warns}${skippedSuite ? ' (suite skipped)' : ''}`,
  );

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const logPath = join(LOG_DIR, `slice44-pi-honest-fail-${stamp()}.log`);
    writeFileSync(logPath, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${logPath}`);
  } catch (e: any) {
    log(`log write failed: ${e?.message ?? e}`);
  }

  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

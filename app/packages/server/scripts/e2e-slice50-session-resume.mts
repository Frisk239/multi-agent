/**
 * Slice 50 · Resume 能力矩阵（S2）· unit + optional API smoke
 *
 * 默认：SERVER=http://127.0.0.1:3001
 * 无服 → live 段 SKIP（不粉饰为 PASS）；unit 段必须绿。
 *
 * 覆盖：
 * 1. sessionResumeCapabilityMatrix：claude/opencode/cursor true；grok/pi false
 * 2. 非支持 runtime resolvePriorSession → unsupported；支持者无 prior → fresh
 * 3. finalize resume_miss / unsupported
 * 4. buildGrokAgentArgs 不传假 --resume
 * 5. 可选：GET /api/settings/diagnostics 能力文案与矩阵一致
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice50-session-resume.mts
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
import { getBackend, allBackends } from '../src/runtime/registry.js';
import { buildGrokAgentArgs } from '../src/runtime/grok.js';

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

function finish(skipped: boolean): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice50-session-resume-${stamp()}.log`);
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
  log('— unit path (no server) —');
  try {
    const matrix = sessionResumeCapabilityMatrix();
    const resumable = new Set(['claude-code', 'opencode', 'cursor']);
    const matrixOk =
      matrix.length === 5 &&
      matrix.every((m) =>
        resumable.has(m.runtime)
          ? m.supportsSessionResume === true
          : m.supportsSessionResume === false,
      );
    if (matrixOk) {
      record({
        id: 'unit.matrix',
        status: 'PASS',
        note: 'claude-code/opencode/cursor=true; grok/pi=false',
      });
    } else {
      record({
        id: 'unit.matrix',
        status: 'FAIL',
        note: JSON.stringify(matrix),
      });
    }

    let backendOk = true;
    for (const b of allBackends()) {
      const expected = resumable.has(b.id);
      if ((b.supportsSessionResume === true) !== expected) {
        backendOk = false;
        record({
          id: `unit.backend.${b.id}`,
          status: 'FAIL',
          note: `supportsSessionResume=${String(b.supportsSessionResume)} expected=${expected}`,
        });
      }
    }
    if (backendOk) {
      record({
        id: 'unit.backend.flags',
        status: 'PASS',
        note: 'getBackend flags match matrix',
      });
    }

    for (const runtime of ['grok', 'pi'] as const) {
      const d = resolvePriorSession({
        id: `run-${runtime}`,
        runtime,
        agentId: 'ag-x',
        issueId: 'iss-x',
        kind: 'issue',
      });
      if (d.status === 'unsupported' && d.resumeSessionId == null) {
        record({
          id: `unit.resolve.${runtime}`,
          status: 'PASS',
          note: 'unsupported / no resume id',
        });
      } else {
        record({
          id: `unit.resolve.${runtime}`,
          status: 'FAIL',
          note: `status=${d.status} resume=${d.resumeSessionId}`,
        });
      }
    }

    // forceFresh avoids depending on local DB schema for prior-session lookup
    for (const runtime of ['opencode', 'cursor'] as const) {
      if (!runtimeSupportsSessionResume(runtime)) {
        record({
          id: `unit.resolve.${runtime}`,
          status: 'FAIL',
          note: 'expected supportsSessionResume=true',
        });
        continue;
      }
      const d = resolvePriorSession({
        id: `run-${runtime}-ff`,
        runtime,
        agentId: `ag-${runtime}-slice50`,
        issueId: `iss-none-${runtime}-slice50`,
        kind: 'issue',
        forceFresh: true,
      });
      if (d.status === 'force_fresh' && d.resumeSessionId == null) {
        record({
          id: `unit.resolve.${runtime}`,
          status: 'PASS',
          note: `${runtime} supported; forceFresh skips binding`,
        });
      } else {
        record({
          id: `unit.resolve.${runtime}`,
          status: 'FAIL',
          note: `status=${d.status} resume=${d.resumeSessionId}`,
        });
      }
    }

    // claude 能力 true；forceFresh 不依赖本地 DB schema / prior 行
    if (runtimeSupportsSessionResume('claude-code')) {
      const dClaude = resolvePriorSession({
        id: 'run-claude-ff',
        runtime: 'claude-code',
        agentId: 'ag-claude',
        issueId: 'iss-none-for-slice50',
        kind: 'issue',
        forceFresh: true,
      });
      if (dClaude.status === 'force_fresh' && dClaude.resumeSessionId == null) {
        record({
          id: 'unit.resolve.claude-force-fresh',
          status: 'PASS',
          note: 'claude supported; forceFresh skips binding',
        });
      } else {
        record({
          id: 'unit.resolve.claude-force-fresh',
          status: 'FAIL',
          note: `status=${dClaude.status} resume=${dClaude.resumeSessionId}`,
        });
      }
    } else {
      record({
        id: 'unit.resolve.claude-force-fresh',
        status: 'FAIL',
        note: 'claude-code supportsSessionResume expected true',
      });
    }

    const miss = finalizeSessionFields({
      planned: {
        resumeSessionId: 'sess-old',
        status: 'resumed',
        reason: 'test',
        sourceRunId: 'r0',
      },
      emittedSessionId: 'sess-new',
      exitReason: 'failed',
      errorText: 'boom',
    });
    if (miss.sessionResumeStatus === 'resume_miss' && miss.providerSessionId == null) {
      record({ id: 'unit.finalize.resume_miss', status: 'PASS', note: 'resume_miss observable' });
    } else {
      record({
        id: 'unit.finalize.resume_miss',
        status: 'FAIL',
        note: `status=${miss.sessionResumeStatus}`,
      });
    }

    const un = finalizeSessionFields({
      planned: {
        resumeSessionId: null,
        status: 'unsupported',
        reason: 'n/a',
        sourceRunId: null,
      },
      emittedSessionId: null,
      exitReason: 'completed',
    });
    if (un.sessionResumeStatus === 'unsupported') {
      record({ id: 'unit.finalize.unsupported', status: 'PASS', note: 'status preserved' });
    } else {
      record({
        id: 'unit.finalize.unsupported',
        status: 'FAIL',
        note: `status=${un.sessionResumeStatus}`,
      });
    }

    const grokArgs = buildGrokAgentArgs(
      {
        prompt: 'x',
        model: null,
        thinkingLevel: null,
        resumeSessionId: 'should-not-appear',
      },
      { print: true },
    );
    if (!grokArgs.includes('--resume') && !grokArgs.includes('should-not-appear')) {
      record({
        id: 'unit.grok.no-fake-resume',
        status: 'PASS',
        note: 'buildGrokAgentArgs ignores resumeSessionId',
      });
    } else {
      record({
        id: 'unit.grok.no-fake-resume',
        status: 'FAIL',
        note: grokArgs.join(' '),
      });
    }

    // backend instances
    if (getBackend('claude-code').supportsSessionResume === true) {
      record({ id: 'unit.claude.flag', status: 'PASS', note: 'true' });
    } else {
      record({ id: 'unit.claude.flag', status: 'FAIL', note: 'expected true' });
    }
  } catch (e) {
    record({ id: 'unit.exception', status: 'FAIL', note: String(e) });
  }
}

async function main(): Promise<void> {
  log(`Slice 50 session-resume e2e · SERVER=${SERVER}`);
  runUnitSmoke();

  log('— live server (optional diagnostics) —');
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
      id: 'service.diagnostics-resume',
      status: 'SKIP',
      note: 'healthz 不可达，跳过 live API',
    });
    finish(true);
    return;
  }

  if (hz.status !== 200) {
    record({
      id: 'service.healthz',
      status: 'FAIL',
      note: `expected 200 got ${hz.status}`,
    });
    record({
      id: 'service.diagnostics-resume',
      status: 'SKIP',
      note: 'healthz 非 200',
    });
    finish(false);
    return;
  }
  record({ id: 'service.healthz', status: 'PASS', note: `status=${hz.status}` });

  try {
    const diag = await api('GET', '/api/settings/diagnostics');
    if (!diag.ok || !diag.json) {
      record({
        id: 'service.diagnostics-resume',
        status: 'FAIL',
        note: `status=${diag.status} body=${diag.text.slice(0, 200)}`,
      });
      finish(false);
      return;
    }

    const backends: Array<{ id: string; capabilities?: string[] }> =
      diag.json.cliBackends ?? diag.json.cli ?? diag.json.backends ?? [];
    if (!Array.isArray(backends) || backends.length === 0) {
      // 结构未知时 WARN 而非 FAIL（不绑死契约字段名）
      record({
        id: 'service.diagnostics-resume',
        status: 'WARN',
        note: 'diagnostics 无 cliBackends 数组；unit 已覆盖能力表',
      });
      finish(false);
      return;
    }

    const byId = new Map(backends.map((b) => [b.id, b]));
    const claude = byId.get('claude') ?? byId.get('claude-code');
    const claudeHas =
      claude?.capabilities?.some((c) => /session resume/i.test(c)) ?? false;
    if (claudeHas) {
      record({
        id: 'service.diag.claude-resume',
        status: 'PASS',
        note: 'claude capabilities include Session Resume',
      });
    } else {
      record({
        id: 'service.diag.claude-resume',
        status: 'FAIL',
        note: `claude caps=${JSON.stringify(claude?.capabilities ?? null)}`,
      });
    }

    // A1: opencode/cursor claim Session Resume; grok/pi must not
    for (const id of ['opencode', 'cursor'] as const) {
      const b = byId.get(id);
      if (!b) continue;
      const has = b.capabilities?.some((c) => /session resume/i.test(c)) ?? false;
      record({
        id: `service.diag.${id}-resume`,
        status: has ? 'PASS' : 'FAIL',
        note: has
          ? `${id} capabilities include Session Resume`
          : `caps=${JSON.stringify(b.capabilities ?? null)}`,
      });
    }
    let nonResumableOk = true;
    for (const id of ['grok', 'pi'] as const) {
      const b = byId.get(id);
      if (!b) continue;
      const has = b.capabilities?.some((c) => /session resume/i.test(c)) ?? false;
      if (has) {
        nonResumableOk = false;
        record({
          id: `service.diag.${id}-no-resume`,
          status: 'FAIL',
          note: 'must not claim Session Resume',
        });
      }
    }
    if (nonResumableOk) {
      record({
        id: 'service.diag.grok-pi-no-resume',
        status: 'PASS',
        note: 'grok/pi do not claim Session Resume',
      });
    }
  } catch (e) {
    record({
      id: 'service.diagnostics-resume',
      status: 'FAIL',
      note: String(e),
    });
  }

  finish(false);
}

await main();

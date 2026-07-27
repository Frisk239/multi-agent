/**
 * Slice 60 · Runtime 捕获均衡 · unit fixture + optional matrix API smoke
 *
 * 默认：SERVER=http://127.0.0.1:3001
 * 无服 → live SKIP；fixture 段必须绿。
 *
 * 覆盖：
 * 1. resume 矩阵仍仅 claude-code=true
 * 2. capture 契约表 opencode/cursor usage+tool+session
 * 3. fixture：opencode Multica 行 → usage/tool/sessionId
 * 4. fixture：cursor Multica 行 → usage/tool/sessionId
 * 5. 可选：diagnostics 不因本刀假 resume
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice60-runtime-capture.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOpencodeLine } from '../src/runtime/opencode.js';
import { parseCursorLine } from '../src/runtime/cursor.js';
import { runtimeCaptureCapabilityMatrix } from '../src/runtime/runtime-capture.js';
import {
  sessionResumeCapabilityMatrix,
  runtimeSupportsSessionResume,
} from '../src/runtime/session-resume.js';
import { hasTokenSignal } from '../src/runtime/usage-parse.js';
import type { LineContext } from '../src/runtime/spawn-line.js';
import type { AgentEvent } from '../src/runtime/types.js';

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

function emptyCtx(): LineContext {
  return { resultText: null, usage: null, providerSessionId: null };
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
    const path = join(LOG_DIR, `e2e-slice60-runtime-capture-${stamp()}.log`);
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
  // Windows + better-sqlite3：立即 process.exit 偶发 UV_HANDLE_CLOSING abort；
  // 延后退出，让 libuv 收尾。
  process.exitCode = fail > 0 ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode ?? 0), 30).unref?.();
}

function runFixtureSmoke(): void {
  log('— fixture / matrix (no CLI) —');
  try {
    const resume = sessionResumeCapabilityMatrix();
    const onlyClaude =
      resume.find((m) => m.runtime === 'claude-code')?.supportsSessionResume === true &&
      resume
        .filter((m) => m.runtime !== 'claude-code')
        .every((m) => m.supportsSessionResume === false);
    record({
      id: 'matrix.resume.honest',
      status: onlyClaude ? 'PASS' : 'FAIL',
      note: onlyClaude
        ? 'claude-code=true; others false'
        : JSON.stringify(resume),
    });

    if (runtimeSupportsSessionResume('opencode') || runtimeSupportsSessionResume('cursor')) {
      record({
        id: 'matrix.resume.no-flip',
        status: 'FAIL',
        note: 'opencode/cursor must remain supportsSessionResume=false',
      });
    } else {
      record({
        id: 'matrix.resume.no-flip',
        status: 'PASS',
        note: 'opencode/cursor resume still false',
      });
    }

    const capture = runtimeCaptureCapabilityMatrix();
    const oc = capture.find((r) => r.runtime === 'opencode');
    const cu = capture.find((r) => r.runtime === 'cursor');
    if (oc?.usage && oc.tool && oc.providerSessionId && cu?.usage && cu.tool && cu.providerSessionId) {
      record({
        id: 'matrix.capture.oc-cursor',
        status: 'PASS',
        note: 'opencode+cursor claim usage/tool/session capture',
      });
    } else {
      record({
        id: 'matrix.capture.oc-cursor',
        status: 'FAIL',
        note: JSON.stringify({ oc, cu }),
      });
    }

    // —— opencode Multica lines ——
    {
      const events: AgentEvent[] = [];
      const ctx = emptyCtx();
      parseOpencodeLine(
        JSON.stringify({ type: 'step_start', sessionID: 'ses_e2e' }),
        (e) => events.push(e),
        ctx,
      );
      parseOpencodeLine(
        `{"type":"tool_use","sessionID":"ses_e2e","part":{"tool":"bash","callID":"c1","state":{"status":"completed","input":{"command":"pwd"},"output":"/tmp\\n"}}}`,
        (e) => events.push(e),
        ctx,
      );
      parseOpencodeLine(
        `{"type":"step_finish","sessionID":"ses_e2e","part":{"tokens":{"input":100,"output":20,"cache":{"read":1,"write":0}}}}`,
        (e) => events.push(e),
        ctx,
      );
      const toolOk =
        events.some((e) => e.type === 'tool_start' && e.name === 'bash') &&
        events.some((e) => e.type === 'tool_end' && e.name === 'bash');
      const usageOk = hasTokenSignal(ctx.usage) && ctx.usage?.input === 100;
      const sidOk = ctx.providerSessionId === 'ses_e2e';
      if (toolOk && usageOk && sidOk) {
        record({
          id: 'fixture.opencode.multica',
          status: 'PASS',
          note: `session=${ctx.providerSessionId} usage=${JSON.stringify(ctx.usage)} tools=ok`,
        });
      } else {
        record({
          id: 'fixture.opencode.multica',
          status: 'FAIL',
          note: `sid=${ctx.providerSessionId} usage=${JSON.stringify(ctx.usage)} toolOk=${toolOk}`,
        });
      }
    }

    // —— cursor Multica lines ——
    {
      const events: AgentEvent[] = [];
      const ctx = emptyCtx();
      parseCursorLine(
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'cursor-e2e-sess',
        }),
        (e) => events.push(e),
        ctx,
      );
      parseCursorLine(
        JSON.stringify({
          type: 'tool_call',
          subtype: 'started',
          call_id: 'call-1',
          session_id: 'cursor-e2e-sess',
          tool_call: { readToolCall: { args: { path: '/x' } } },
        }),
        (e) => events.push(e),
        ctx,
      );
      parseCursorLine(
        JSON.stringify({
          type: 'tool_call',
          subtype: 'completed',
          call_id: 'call-1',
          session_id: 'cursor-e2e-sess',
          tool_call: {
            readToolCall: {
              args: { path: '/x' },
              result: { success: { content: 'hi' } },
            },
          },
        }),
        (e) => events.push(e),
        ctx,
      );
      parseCursorLine(
        JSON.stringify({
          type: 'result',
          result: 'final',
          session_id: 'cursor-e2e-sess',
          usage: {
            inputTokens: 50,
            outputTokens: 7,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        }),
        (e) => events.push(e),
        ctx,
      );
      const toolOk =
        events.some((e) => e.type === 'tool_start' && e.name === 'read') &&
        events.some((e) => e.type === 'tool_end' && e.name === 'read');
      const usageOk = ctx.usage?.input === 50 && ctx.usage?.output === 7;
      const sidOk = ctx.providerSessionId === 'cursor-e2e-sess';
      if (toolOk && usageOk && sidOk) {
        record({
          id: 'fixture.cursor.multica',
          status: 'PASS',
          note: `session=${ctx.providerSessionId} usage=${JSON.stringify(ctx.usage)} tools=ok`,
        });
      } else {
        record({
          id: 'fixture.cursor.multica',
          status: 'FAIL',
          note: `sid=${ctx.providerSessionId} usage=${JSON.stringify(ctx.usage)} toolOk=${toolOk}`,
        });
      }
    }

    // capture gap documentation present
    const gapNotes = capture.map((r) => r.gapNote).filter(Boolean);
    record({
      id: 'docs.capture-gaps',
      status: gapNotes.length >= 4 ? 'PASS' : 'FAIL',
      note: `gap notes=${gapNotes.length} (uncosted/no_tokens 诚实说明)`,
    });
  } catch (e) {
    record({ id: 'fixture.exception', status: 'FAIL', note: String(e) });
  }
}

async function main(): Promise<void> {
  log(`Slice 60 runtime-capture e2e · SERVER=${SERVER}`);
  runFixtureSmoke();

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
    finish(false);
    return;
  }
  record({ id: 'service.healthz', status: 'PASS', note: `status=${hz.status}` });

  try {
    const diag = await api('GET', '/api/settings/diagnostics');
    if (!diag.ok || !diag.json) {
      record({
        id: 'service.diagnostics',
        status: 'WARN',
        note: `status=${diag.status}; fixture 已覆盖捕获`,
      });
      finish(false);
      return;
    }
    const backends: Array<{ id: string; capabilities?: string[] }> =
      diag.json.cliBackends ?? diag.json.cli ?? diag.json.backends ?? [];
    if (!Array.isArray(backends) || backends.length === 0) {
      record({
        id: 'service.diagnostics',
        status: 'WARN',
        note: 'no cliBackends array; fixture ok',
      });
      finish(false);
      return;
    }
    let othersOk = true;
    for (const id of ['opencode', 'cursor', 'grok', 'pi']) {
      const b = backends.find((x) => x.id === id || x.id === `${id}-code`);
      if (!b) continue;
      const has = b.capabilities?.some((c) => /session resume/i.test(c)) ?? false;
      if (has) {
        othersOk = false;
        record({
          id: `service.diag.${id}-no-resume`,
          status: 'FAIL',
          note: 'must not claim Session Resume after Slice 60 capture deepen',
        });
      }
    }
    if (othersOk) {
      record({
        id: 'service.diag.others-no-resume',
        status: 'PASS',
        note: 'non-claude backends still do not claim Session Resume',
      });
    }
  } catch (e) {
    record({ id: 'service.diagnostics', status: 'WARN', note: String(e) });
  }

  finish(false);
}

await main();

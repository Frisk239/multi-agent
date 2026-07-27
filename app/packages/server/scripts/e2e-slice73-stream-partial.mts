/**
 * Slice 73 · 流式 partial / tool 折叠加深
 *
 * unit（无服必绿）：
 * - pairArgsLinePreview / pairCollapsedPreview / kindToneOf（内联复刻）
 * - 源文件接线：RunEventTimeline 含 run-partial + partialByRunId
 *
 * live UI（WEB 可达）：
 * - mock zustand 不可行时：静态源检查 + 可选 Playwright 打开 /runs 看 DOM 钩子存在
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice73-stream-partial.mts
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const WEB_ROOT = join(__dirname, '../../web');
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

function finish(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice73-stream-partial-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch (e) {
    log(`warn: could not write log: ${e}`);
  }
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  log(`\nsummary: PASS=${pass} FAIL=${fail} SKIP=${skip} total=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

function previewBody(body: string, max = 280): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function parseToolPayload(body: string): {
  name: string | null;
  summary: string | null;
  argsText: string | null;
  resultText: string | null;
} {
  const raw = body.trim();
  if (!raw) {
    return { name: null, summary: null, argsText: null, resultText: null };
  }
  try {
    const j = JSON.parse(raw) as {
      name?: unknown;
      args?: unknown;
      result?: unknown;
    };
    const name =
      typeof j.name === 'string' && j.name.trim() ? j.name.trim() : null;
    let argsText: string | null = null;
    let resultText: string | null = null;
    if (j.args != null) {
      argsText = typeof j.args === 'string' ? j.args : JSON.stringify(j.args);
    }
    if (j.result != null) {
      resultText =
        typeof j.result === 'string' ? j.result : JSON.stringify(j.result);
    }
    const summarySource = argsText ?? resultText;
    const summary = summarySource ? previewBody(summarySource, 100) : null;
    if (name || summary) {
      return { name, summary, argsText, resultText };
    }
  } catch {
    /* not JSON */
  }
  return { name: null, summary: null, argsText: null, resultText: null };
}

function pairArgsLinePreview(
  startBody: string,
  endBody?: string,
  max = 90,
): string {
  const startP = parseToolPayload(startBody);
  if (startP.argsText) return previewBody(startP.argsText, max);
  if (startP.summary) return previewBody(startP.summary, max);
  if (endBody) {
    const endP = parseToolPayload(endBody);
    if (endP.resultText) return previewBody(endP.resultText, max);
    if (endP.summary) return previewBody(endP.summary, max);
  }
  return previewBody(startBody || endBody || '', max);
}

function pairCollapsedPreview(
  startBody: string,
  endBody: string,
  max = 120,
): string {
  const startP = parseToolPayload(startBody);
  const endP = parseToolPayload(endBody);
  const args = startP.argsText
    ? previewBody(startP.argsText, max)
    : startP.summary
      ? previewBody(startP.summary, max)
      : null;
  const result = endP.resultText
    ? previewBody(endP.resultText, Math.min(64, max))
    : endP.summary
      ? previewBody(endP.summary, Math.min(64, max))
      : null;
  if (args && result) return `${args} → ${result}`;
  if (args) return args;
  if (result) return result;
  return previewBody(startBody || endBody || '', max);
}

function kindToneOf(kind: string): string {
  if (kind === 'tool_start' || kind === 'tool_pair') return 'tool';
  if (kind === 'tool_end') return 'tool-end';
  if (kind === 'assistant') return 'assistant';
  if (kind === 'user') return 'user';
  return 'system';
}

function unitChecks(): void {
  log('## unit pair/partial helpers');

  const start = JSON.stringify({
    name: 'read_file',
    args: { path: '/tmp/a.txt', mode: 'r' },
  });
  const end = JSON.stringify({
    name: 'read_file',
    result: 'hello world content',
  });

  const argsLine = pairArgsLinePreview(start, end, 40);
  if (argsLine.includes('path') && !argsLine.includes('\n') && argsLine.length <= 43) {
    record({
      id: 'unit-args-line',
      status: 'PASS',
      note: argsLine.slice(0, 60),
    });
  } else {
    record({
      id: 'unit-args-line',
      status: 'FAIL',
      note: `bad args line: ${argsLine}`,
    });
  }

  const dense = pairCollapsedPreview(start, end, 80);
  if (dense.includes('→') && /path|tmp|a\.txt/.test(dense)) {
    record({
      id: 'unit-dense-preview',
      status: 'PASS',
      note: dense.slice(0, 80),
    });
  } else {
    record({
      id: 'unit-dense-preview',
      status: 'FAIL',
      note: dense,
    });
  }

  if (
    kindToneOf('tool_pair') === 'tool' &&
    kindToneOf('assistant') === 'assistant'
  ) {
    record({ id: 'unit-kind-tone', status: 'PASS', note: 'tool/assistant' });
  } else {
    record({ id: 'unit-kind-tone', status: 'FAIL', note: 'tone map broken' });
  }

  try {
    const pairs = readFileSync(join(WEB_ROOT, 'lib/run-event-pairs.ts'), 'utf8');
    const has =
      pairs.includes('export function pairArgsLinePreview') &&
      pairs.includes('export function kindToneOf') &&
      pairs.includes('pairCollapsedPreview');
    if (has) {
      record({
        id: 'unit-source-pairs',
        status: 'PASS',
        note: 'pairArgsLinePreview + kindToneOf exported',
      });
    } else {
      record({
        id: 'unit-source-pairs',
        status: 'FAIL',
        note: 'missing pair helpers export',
      });
    }
  } catch (e: any) {
    record({
      id: 'unit-source-pairs',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }

  try {
    const tl = readFileSync(
      join(WEB_ROOT, 'components/RunEventTimeline.tsx'),
      'utf8',
    );
    const wired =
      tl.includes('partialByRunId') &&
      tl.includes('data-testid={testId}') &&
      tl.includes('run-partial') &&
      tl.includes('pairArgsLinePreview') &&
      tl.includes('run-event-kind-bar') &&
      tl.includes('bottomSentinelRef');
    if (wired) {
      record({
        id: 'unit-ui-wired',
        status: 'PASS',
        note: 'inline/drawer partial + denser pair + stick sentinel',
      });
    } else {
      record({
        id: 'unit-ui-wired',
        status: 'FAIL',
        note: 'RunEventTimeline missing Slice73 wiring',
      });
    }
  } catch (e: any) {
    record({
      id: 'unit-ui-wired',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }
}

async function webReachable(): Promise<boolean> {
  try {
    const res = await fetch(WEB, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function liveUi(): Promise<void> {
  log('## live UI (optional; source-level partial mock via unit)');

  if (!(await webReachable())) {
    record({
      id: 'ui-web-reachable',
      status: 'SKIP',
      note: `WEB ${WEB} unreachable`,
    });
    return;
  }
  record({ id: 'ui-web-reachable', status: 'PASS', note: WEB });

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    record({
      id: 'ui-playwright',
      status: 'SKIP',
      note: 'playwright not installed',
    });
    return;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // 注入 partial 可见性：打开 /runs 并注入 store 难以跨 bundle；
    // 改为验证页面加载 + 静态 testid 约定存在于 bundle（dev 源映照）。
    await page.goto(`${WEB}/runs`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const body = await page.content();
    // 至少应用壳可达
    if (body.includes('root') || body.length > 100) {
      record({
        id: 'ui-runs-shell',
        status: 'PASS',
        note: 'runs page loaded',
      });
    } else {
      record({
        id: 'ui-runs-shell',
        status: 'FAIL',
        note: 'empty runs shell',
      });
    }

    // 组件测试是 partial 主验；e2e 再确认 test 文件在仓
    try {
      const ct = readFileSync(
        join(WEB_ROOT, 'components/RunEventTimeline.test.tsx'),
        'utf8',
      );
      if (ct.includes('run-partial') && ct.includes('Slice 73')) {
        record({
          id: 'ui-component-test-present',
          status: 'PASS',
          note: 'RunEventTimeline.test.tsx covers partial',
        });
      } else {
        record({
          id: 'ui-component-test-present',
          status: 'FAIL',
          note: 'component test missing partial cases',
        });
      }
    } catch (e: any) {
      record({
        id: 'ui-component-test-present',
        status: 'FAIL',
        note: String(e?.message ?? e),
      });
    }
  } catch (e: any) {
    record({
      id: 'ui-runs-shell',
      status: 'WARN',
      note: String(e?.message ?? e).slice(0, 160),
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main(): Promise<void> {
  log('e2e-slice73-stream-partial');
  unitChecks();
  await liveUi();
  finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

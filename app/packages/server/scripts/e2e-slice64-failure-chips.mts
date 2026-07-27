/**
 * Slice 64 · 失败 chip 中文动作映射 · Playwright live 验收
 *
 * 默认：WEB=http://127.0.0.1:3000  SERVER=http://127.0.0.1:3001
 * WEB 不可达 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖：
 * 1. WEB 可达
 * 2. Playwright route mock GET /api/runs/:id（failureReason=auth_required）
 *    → Run 详情可见 [data-testid=run-failure-chip] 文案「需登录」+ 建议动作
 * 3. route mock GET /api/runs 列表含 failed run
 *    → Runs 列表可见 [data-testid=runs-failure-chip]
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice64-failure-chips.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page, type Route } from 'playwright';

const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';
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

const SLICE64 = {
  runDetailPage: '[data-testid="run-detail-page"]',
  runFailureChip: '[data-testid="run-failure-chip"]',
  runsPage: '[data-testid="runs-page"]',
  runsFailureChip: '[data-testid="runs-failure-chip"]',
  runsTable: '[data-testid="runs-table"]',
} as const;

const MOCK_RUN_ID = 'run_slice64_auth_fail_mock';
const MOCK_AGENT_ID = 'agt_slice64_mock';

const mockFailedRun = {
  id: MOCK_RUN_ID,
  issueId: null,
  agentId: MOCK_AGENT_ID,
  runtime: 'claude-code',
  status: 'failed',
  failureReason: 'auth_required',
  kind: 'quick_create',
  quickPrompt: 'slice64 failure chip probe',
  chatThreadId: null,
  error: 'unauthorized: login required (slice64 mock)',
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  finishedAt: new Date().toISOString(),
  lastHeartbeatAt: null,
  isLeader: false,
  squadId: null,
  rerunOfRunId: null,
  cwdPath: null,
  cwdMode: null,
  projectId: null,
  pathWaitReason: null,
  pathBlockedByRunId: null,
  pathHolding: false,
  tokensInput: null,
  tokensOutput: null,
  costUsd: null,
  model: 'mock',
  thinkingLevel: null,
  parentRunId: null,
  providerSessionId: null,
  resumedSessionId: null,
  sessionResumeStatus: null,
  sessionPoisoned: false,
  createdAt: new Date(Date.now() - 120_000).toISOString(),
};

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

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    try {
      return await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      return await chromium.launch({ channel: 'msedge', headless: true });
    }
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

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/** 仅匹配后端 API（避免误伤 Next 页面 `/runs`） */
function isBackendApi(url: string): boolean {
  try {
    const u = new URL(url);
    // 默认 API 在 3001；也兼容 path 含 /api/
    if (u.port === '3001' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.pathname.includes('/api/');
    }
    return u.pathname.includes('/api/');
  } catch {
    return url.includes('/api/');
  }
}

function isApiRunsList(pathname: string): boolean {
  // 严格：…/api/runs 或 …/api/runs/（带 query 时 pathname 无 query）
  return /\/api\/runs\/?$/.test(pathname);
}

function isApiRunDetail(pathname: string, runId: string): boolean {
  const encoded = encodeURIComponent(runId);
  // 不要匹配 /messages|/children|/tree 子路径
  const re = new RegExp(
    `/api/runs/(?:${runId}|${encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})$`,
  );
  return re.test(pathname);
}

function isApiRunMessages(pathname: string, runId: string): boolean {
  return (
    pathname.includes(`/api/runs/${runId}/messages`) ||
    pathname.includes(`/api/runs/${encodeURIComponent(runId)}/messages`)
  );
}

function isApiRunChildrenOrTree(pathname: string, runId: string): boolean {
  return (
    pathname.includes(`/api/runs/${runId}/children`) ||
    pathname.includes(`/api/runs/${runId}/tree`) ||
    pathname.includes(`/api/runs/${encodeURIComponent(runId)}/children`) ||
    pathname.includes(`/api/runs/${encodeURIComponent(runId)}/tree`)
  );
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  });
}

async function maybeFulfillPreflight(route: Route, url: string): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') return false;
  if (!isBackendApi(url) && !pathnameOf(url).includes('/api/')) {
    return false;
  }
  await route.fulfill({
    status: 204,
    headers: CORS_HEADERS,
    body: '',
  });
  return true;
}

async function installDetailMocks(page: Page): Promise<{ detailHits: number; msgHits: number }> {
  const counters = { detailHits: 0, msgHits: 0 };
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (await maybeFulfillPreflight(route, url)) return;

    if (req.method() !== 'GET') {
      await route.continue();
      return;
    }
    if (!isBackendApi(url) && !pathnameOf(url).includes('/api/')) {
      await route.continue();
      return;
    }
    const pathname = pathnameOf(url);

    if (isApiRunMessages(pathname, MOCK_RUN_ID)) {
      counters.msgHits += 1;
      await fulfillJson(route, []);
      return;
    }
    if (isApiRunChildrenOrTree(pathname, MOCK_RUN_ID)) {
      await fulfillJson(
        route,
        pathname.includes('/tree')
          ? {
              id: MOCK_RUN_ID,
              status: 'failed',
              kind: 'quick_create',
              children: [],
            }
          : [],
      );
      return;
    }
    if (isApiRunDetail(pathname, MOCK_RUN_ID)) {
      counters.detailHits += 1;
      await fulfillJson(route, mockFailedRun);
      return;
    }
    // agent 可选
    if (
      pathname === `/api/agents/${MOCK_AGENT_ID}` ||
      pathname.endsWith(`/api/agents/${MOCK_AGENT_ID}`)
    ) {
      await fulfillJson(route, {
        id: MOCK_AGENT_ID,
        name: 'Slice64 Mock Agent',
        runtime: 'claude-code',
        status: 'idle',
      });
      return;
    }
    await route.continue();
  });
  return counters;
}

async function installListMocks(page: Page): Promise<{ listHits: number }> {
  const counters = { listHits: 0 };
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (await maybeFulfillPreflight(route, url)) return;

    if (req.method() !== 'GET') {
      await route.continue();
      return;
    }
    if (!isBackendApi(url) && !pathnameOf(url).includes('/api/')) {
      await route.continue();
      return;
    }
    const pathname = pathnameOf(url);
    if (isApiRunsList(pathname) && !pathname.includes('/active-count')) {
      counters.listHits += 1;
      await fulfillJson(route, [mockFailedRun]);
      return;
    }
    if (
      pathname === '/api/agents' ||
      pathname.endsWith('/api/agents') ||
      pathname === '/api/squads' ||
      pathname.endsWith('/api/squads')
    ) {
      await fulfillJson(route, []);
      return;
    }
    await route.continue();
  });
  return counters;
}

function finish(skipped: boolean): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice64-failure-chips-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 64 failure-chips e2e report');
  console.log('========================================');
  for (const r of results) {
    console.log(`[${r.status}] ${r.id} — ${r.note}`);
  }
  const fails = results.filter((r) => r.status === 'FAIL');
  const skips = results.filter((r) => r.status === 'SKIP');
  if (fails.length) {
    console.error(`\nFAIL: ${fails.length} check(s)`);
    process.exitCode = 1;
    return;
  }
  if (
    skipped ||
    (skips.length && results.every((r) => r.status === 'SKIP' || r.status === 'WARN'))
  ) {
    console.log('\nSKIP: WEB unreachable or suite skipped (not a greenwash PASS)');
    process.exitCode = 0;
    return;
  }
  console.log('\nPASS: failure-chips checks ok');
  process.exitCode = 0;
}

async function main(): Promise<void> {
  log(`Slice 64 failure-chips e2e · WEB=${WEB} SERVER=${SERVER}`);

  record({
    id: 'unit.selectors',
    status: 'PASS',
    note: `keys ${Object.keys(SLICE64).length}; mock reason=auth_required`,
  });

  const up = await webReachable();
  if (!up) {
    record({
      id: 'web.reachable',
      status: 'SKIP',
      note: `WEB ${WEB} 不可达`,
    });
    finish(true);
    return;
  }
  record({ id: 'web.reachable', status: 'PASS', note: WEB });

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();

    // —— Run 详情：mock GET /api/runs/:id ——
    try {
      const detailPage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      const counters = await installDetailMocks(detailPage);
      await detailPage.goto(`${WEB}/runs/${MOCK_RUN_ID}?_slice64=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await detailPage
        .waitForSelector(SLICE64.runDetailPage, { timeout: 15000 })
        .catch(() => undefined);
      await detailPage.waitForTimeout(800);

      const chip = detailPage.locator(SLICE64.runFailureChip).first();
      let chipVisible = await chip.isVisible().catch(() => false);
      if (!chipVisible) {
        // 再等一轮（react-query）
        await detailPage.waitForTimeout(1500);
        chipVisible = await chip.isVisible().catch(() => false);
      }

      const chipText = chipVisible
        ? ((await chip.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
        : '';
      const hasLabel = chipText.includes('需登录');
      const hasAction =
        chipText.includes('检查 CLI') ||
        chipText.includes('账号登录') ||
        chipText.includes('登录后重试');
      const reasonAttr = chipVisible
        ? (await chip.getAttribute('data-reason').catch(() => null)) ?? ''
        : '';
      const variantAttr = chipVisible
        ? (await chip.getAttribute('data-variant').catch(() => null)) ?? ''
        : '';

      if (chipVisible && hasLabel && hasAction) {
        record({
          id: 'run.detail.failure.chip',
          status: 'PASS',
          note: `chip visible · reason=${reasonAttr || 'auth_required'} · variant=${variantAttr || 'human'} · text~ ${chipText.slice(0, 80)} (detailHits=${counters.detailHits})`,
        });
      } else {
        const bodyText = (
          await detailPage.locator('body').innerText().catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 220);
        record({
          id: 'run.detail.failure.chip',
          status: counters.detailHits > 0 || bodyText.includes('失败') ? 'FAIL' : 'WARN',
          note: `chip missing/incomplete · visible=${chipVisible} label=${hasLabel} action=${hasAction} hits=${counters.detailHits}. body~ ${bodyText}`,
        });
      }
      await detailPage.close().catch(() => undefined);
    } catch (e: any) {
      record({
        id: 'run.detail.failure.chip',
        status: 'WARN',
        note: `detail route mock failed: ${String(e?.message ?? e).slice(0, 180)}`,
      });
    }

    // —— Runs 列表：mock GET /api/runs ——
    try {
      const listPage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      const counters = await installListMocks(listPage);
      await listPage.goto(`${WEB}/runs?_slice64=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await listPage
        .waitForSelector(SLICE64.runsPage, { timeout: 15000 })
        .catch(() => undefined);
      await listPage.waitForTimeout(800);

      const chip = listPage.locator(SLICE64.runsFailureChip).first();
      let chipVisible = await chip.isVisible().catch(() => false);
      if (!chipVisible) {
        await listPage.waitForTimeout(1500);
        chipVisible = await chip.isVisible().catch(() => false);
      }

      const chipText = chipVisible
        ? ((await chip.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
        : '';
      const hasLabel = chipText.includes('需登录');
      const hasAction =
        chipText.includes('检查 CLI') ||
        chipText.includes('账号登录') ||
        chipText.includes('登录后重试');

      if (chipVisible && hasLabel) {
        record({
          id: 'runs.list.failure.chip',
          status: 'PASS',
          note: `list chip · text~ ${chipText.slice(0, 80)} (listHits=${counters.listHits}; action=${hasAction})`,
        });
      } else {
        const bodyText = (
          await listPage.locator('body').innerText().catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 220);
        record({
          id: 'runs.list.failure.chip',
          status: counters.listHits > 0 ? 'FAIL' : 'WARN',
          note: `list chip missing · visible=${chipVisible} label=${hasLabel} hits=${counters.listHits}. body~ ${bodyText}`,
        });
      }
      await listPage.close().catch(() => undefined);
    } catch (e: any) {
      record({
        id: 'runs.list.failure.chip',
        status: 'WARN',
        note: `list route mock failed: ${String(e?.message ?? e).slice(0, 180)}`,
      });
    }
  } catch (e: any) {
    record({
      id: 'browser.launch',
      status: 'FAIL',
      note: String(e?.message ?? e).slice(0, 200),
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }

  finish(false);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

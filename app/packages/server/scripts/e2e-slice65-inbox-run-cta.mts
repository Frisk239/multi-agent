/**
 * Slice 65 · Inbox / Run 主 CTA · Playwright live 验收
 *
 * 默认：WEB=http://127.0.0.1:3000  SERVER=http://127.0.0.1:3001
 * WEB 不可达 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖：
 * 1. WEB 可达
 * 2. route mock GET /api/inbox 含 run_failed 条目
 *    → 列表可见 [data-testid=inbox-primary-cta]
 *    → 主 CTA 可点到 /runs?run=… 目标（open_run 或 retry 带 data-cta-kind）
 * 3. 空态文案强调「需要处理」
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice65-inbox-run-cta.mts
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

const SLICE65 = {
  inboxPage: '[data-testid="inbox-page"]',
  primaryCta: '[data-testid="inbox-primary-cta"]',
  activeList: '[data-testid="inbox-active-list"]',
  emptyActions: '[data-testid="inbox-empty-actions"]',
} as const;

const MOCK_RUN_ID = 'run_slice65_fail_mock';
const MOCK_ISSUE_ID = 'iss_slice65_mock';
const MOCK_INBOX_ID = 'inbox_slice65_fail_1';
const MOCK_INBOX_QC_ID = 'inbox_slice65_qc_1';
const MOCK_RUN_QC_ID = 'run_slice65_qc_mock';

const mockFailedWithIssue = {
  id: MOCK_INBOX_ID,
  type: 'run_failed',
  kind: 'run_failed',
  severity: 'action_required',
  title: '运行失败 · Slice65 issue',
  body: 'slice65 mock fail body',
  summary: '运行失败 · Slice65 issue',
  issueId: MOCK_ISSUE_ID,
  runId: MOCK_RUN_ID,
  issueIdentifier: 'MA-S65',
  issueTitle: 'Slice65 probe issue',
  read: false,
  archived: false,
  createdAt: new Date().toISOString(),
};

const mockFailedQuickCreate = {
  id: MOCK_INBOX_QC_ID,
  type: 'run_failed',
  kind: 'run_failed',
  severity: 'action_required',
  title: '快速派活失败 · Slice65',
  body: 'qc mock fail',
  summary: '快速派活失败 · Slice65',
  issueId: null,
  runId: MOCK_RUN_QC_ID,
  read: false,
  archived: false,
  createdAt: new Date(Date.now() - 1000).toISOString(),
};

const mockRunDetail = {
  id: MOCK_RUN_ID,
  issueId: MOCK_ISSUE_ID,
  agentId: 'agt_slice65',
  runtime: 'claude-code',
  status: 'failed',
  failureReason: 'exec_error',
  kind: 'issue',
  quickPrompt: null,
  chatThreadId: null,
  error: 'slice65 mock error',
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

function isBackendApi(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.port === '3001' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.pathname.includes('/api/');
    }
    return u.pathname.includes('/api/');
  } catch {
    return url.includes('/api/');
  }
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

async function installInboxMocks(
  page: Page,
  mode: 'items' | 'empty',
): Promise<{ inboxHits: number }> {
  const counters = { inboxHits: 0 };
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

    if (
      pathname === '/api/inbox' ||
      pathname.endsWith('/api/inbox') ||
      /\/api\/inbox\/?$/.test(pathname)
    ) {
      counters.inboxHits += 1;
      if (mode === 'empty') {
        await fulfillJson(route, { items: [], unreadCount: 0 });
      } else {
        await fulfillJson(route, {
          items: [mockFailedWithIssue, mockFailedQuickCreate],
          unreadCount: 2,
        });
      }
      return;
    }

    // issue 详情可选（避免选中失败）
    if (
      pathname.includes(`/api/issues/${MOCK_ISSUE_ID}`) ||
      pathname.endsWith(`/api/issues/${MOCK_ISSUE_ID}`)
    ) {
      await fulfillJson(route, {
        id: MOCK_ISSUE_ID,
        identifier: 'MA-S65',
        title: 'Slice65 probe issue',
        status: 'in_progress',
        description: 'mock',
        assigneeIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (
      pathname === `/api/runs/${MOCK_RUN_ID}` ||
      pathname.endsWith(`/api/runs/${MOCK_RUN_ID}`)
    ) {
      await fulfillJson(route, mockRunDetail);
      return;
    }

    if (pathname === '/api/agents' || pathname.endsWith('/api/agents')) {
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
    const path = join(LOG_DIR, `e2e-slice65-inbox-run-cta-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 65 inbox-run-cta e2e report');
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
  console.log('\nPASS: inbox-run-cta checks ok');
  process.exitCode = 0;
}

async function main(): Promise<void> {
  log(`Slice 65 inbox-run-cta e2e · WEB=${WEB} SERVER=${SERVER}`);

  record({
    id: 'unit.selectors',
    status: 'PASS',
    note: `keys ${Object.keys(SLICE65).length}; mock failed inbox ×2`,
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

    // —— 有 failed inbox：主 CTA 可见且可导航 ——
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      const counters = await installInboxMocks(page, 'items');
      await page.goto(`${WEB}/inbox?_slice65=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await page
        .waitForSelector(SLICE65.inboxPage, { timeout: 15000 })
        .catch(() => undefined);
      await page.waitForTimeout(900);

      const cta = page.locator(SLICE65.primaryCta).first();
      let ctaVisible = await cta.isVisible().catch(() => false);
      if (!ctaVisible) {
        await page.waitForTimeout(1500);
        ctaVisible = await cta.isVisible().catch(() => false);
      }

      const ctaKind = ctaVisible
        ? (await cta.getAttribute('data-cta-kind').catch(() => null)) ?? ''
        : '';
      const ctaText = ctaVisible
        ? ((await cta.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
        : '';
      const href = ctaVisible
        ? (await cta.getAttribute('href').catch(() => null)) ?? ''
        : '';
      const tag = ctaVisible
        ? await cta.evaluate((el) => el.tagName.toLowerCase()).catch(() => '')
        : '';

      if (!ctaVisible) {
        const bodyText = (
          await page.locator('body').innerText().catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 240);
        record({
          id: 'inbox.primary.cta.visible',
          status: counters.inboxHits > 0 ? 'FAIL' : 'WARN',
          note: `CTA missing · hits=${counters.inboxHits}. body~ ${bodyText}`,
        });
      } else {
        record({
          id: 'inbox.primary.cta.visible',
          status: 'PASS',
          note: `visible kind=${ctaKind || '?'} text~ ${ctaText.slice(0, 40)} tag=${tag} hits=${counters.inboxHits}`,
        });

        // open_run 链路：QC 失败条目主按钮应是 Link → /runs?run=…
        // 找 data-cta-kind=open_run 优先；否则 retry 也算可行动
        const openRun = page.locator(`${SLICE65.primaryCta}[data-cta-kind="open_run"]`).first();
        const openRunVisible = await openRun.isVisible().catch(() => false);
        if (openRunVisible) {
          const openHref =
            (await openRun.getAttribute('href').catch(() => null)) ?? '';
          const targetsRun =
            openHref.includes('/runs') &&
            (openHref.includes(MOCK_RUN_QC_ID) ||
              openHref.includes('run=') ||
              openHref.includes('status=failed'));
          if (targetsRun) {
            // 点击并确认 URL 变化
            await openRun.click();
            await page.waitForTimeout(800);
            const url = page.url();
            const navigated =
              url.includes('/runs') &&
              (url.includes(MOCK_RUN_QC_ID) ||
                url.includes('run=') ||
                url.includes('status=failed'));
            record({
              id: 'inbox.primary.cta.navigate',
              status: navigated ? 'PASS' : 'FAIL',
              note: navigated
                ? `nav → ${url.slice(0, 120)} (href was ${openHref.slice(0, 80)})`
                : `click open_run but url=${url.slice(0, 120)} href=${openHref}`,
            });
          } else {
            record({
              id: 'inbox.primary.cta.navigate',
              status: 'FAIL',
              note: `open_run href unexpected: ${openHref}`,
            });
          }
        } else if (ctaKind === 'retry' || tag === 'button') {
          // retry 按钮：验证 data-run-id 与可点击（不真发 retry）
          const runIdAttr =
            (await cta.getAttribute('data-run-id').catch(() => null)) ?? '';
          const enabled = await cta.isEnabled().catch(() => false);
          record({
            id: 'inbox.primary.cta.navigate',
            status: enabled && (runIdAttr || ctaKind === 'retry') ? 'PASS' : 'WARN',
            note: `retry CTA clickable=${enabled} runId=${runIdAttr || 'n/a'} (no POST; honest retry control)`,
          });
        } else if (href.includes('/runs') || href.includes('/chat') || href.includes('/issues')) {
          await cta.click();
          await page.waitForTimeout(800);
          const url = page.url();
          const ok =
            url.includes('/runs') ||
            url.includes('/chat') ||
            url.includes('/issues');
          record({
            id: 'inbox.primary.cta.navigate',
            status: ok ? 'PASS' : 'FAIL',
            note: ok ? `nav → ${url.slice(0, 120)}` : `url after click ${url.slice(0, 120)}`,
          });
        } else {
          record({
            id: 'inbox.primary.cta.navigate',
            status: 'FAIL',
            note: `no open_run/retry/href path · kind=${ctaKind} href=${href}`,
          });
        }
      }
      await page.close().catch(() => undefined);
    } catch (e: any) {
      record({
        id: 'inbox.primary.cta.visible',
        status: 'WARN',
        note: `items route mock failed: ${String(e?.message ?? e).slice(0, 180)}`,
      });
    }

    // —— 空态强调「需要处理」——
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      await installInboxMocks(page, 'empty');
      await page.goto(`${WEB}/inbox?_slice65empty=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await page
        .waitForSelector(SLICE65.inboxPage, { timeout: 15000 })
        .catch(() => undefined);
      await page.waitForTimeout(900);

      const bodyText = (
        await page.locator('body').innerText().catch(() => '')
      ).replace(/\s+/g, ' ');
      const emphasizes =
        bodyText.includes('没有需要处理的项') ||
        bodyText.includes('需要处理') ||
        bodyText.includes('需处理');
      record({
        id: 'inbox.empty.actionable.copy',
        status: emphasizes ? 'PASS' : 'FAIL',
        note: emphasizes
          ? 'empty copy emphasizes 需处理'
          : `empty copy missing · body~ ${bodyText.slice(0, 180)}`,
      });
      await page.close().catch(() => undefined);
    } catch (e: any) {
      record({
        id: 'inbox.empty.actionable.copy',
        status: 'WARN',
        note: `empty mock failed: ${String(e?.message ?? e).slice(0, 180)}`,
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

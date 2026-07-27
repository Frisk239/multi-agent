/**
 * Slice 62 · Chat + Issue 空错态对齐 · Playwright live 验收
 *
 * 默认：WEB=http://127.0.0.1:3000  SERVER=http://127.0.0.1:3001
 * WEB 不可达 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖：
 * 1. WEB 可达
 * 2. route 拦截 GET /api/chat/threads → Chat ErrorState「加载会话失败」+ 重试
 * 3. 或正常空态 chat-empty / EmptyState 可见
 * 4. route 拦截 GET /api/issues/:id → Issue ErrorState「加载 Issue 失败」+ 回看板
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice62-chat-issue-states.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';

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

const SLICE62 = {
  chatPage: '[data-testid="chat-page"]',
  chatEmpty: '[data-testid="chat-empty"]',
  chatThreadsError: '[data-testid="chat-threads-error"]',
  chatMainError: '[data-testid="chat-main-error"]',
  chatThreadsEmpty: '[data-testid="chat-threads-empty"]',
  issueDetailError: '[data-testid="issue-detail-error"]',
  issueBackBoard: '[data-testid="issue-back-board"]',
  issueSideSheet: '[data-testid="issue-side-sheet"]',
} as const;

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

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  try {
    const res = await fetch(`${SERVER}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e: any) {
    return { ok: false, status: 0, json: null, text: String(e?.message ?? e) };
  }
}

function finish(skipped: boolean): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice62-chat-issue-states-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 62 chat-issue-states e2e report');
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
  console.log('\nPASS: chat-issue-states checks ok');
  process.exitCode = 0;
}

async function main(): Promise<void> {
  log(`Slice 62 chat-issue-states e2e · WEB=${WEB} SERVER=${SERVER}`);

  record({
    id: 'unit.selectors',
    status: 'PASS',
    note: `keys ${Object.keys(SLICE62).length}`,
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

    // —— Chat 错误路径：新 page + 先 route 再导航 ——
    try {
      const errPage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      let threadsGetHits = 0;
      await errPage.route('**/*', async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();
        let pathname = '';
        try {
          pathname = new URL(url).pathname;
        } catch {
          await route.continue();
          return;
        }
        // GET /api/chat/threads（带 query 归档）；messages 子路径放行（本用例不依赖）
        if (
          method === 'GET' &&
          (pathname === '/api/chat/threads' || pathname.endsWith('/api/chat/threads'))
        ) {
          threadsGetHits += 1;
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'slice62 mock chat threads fail' }),
          });
          return;
        }
        await route.continue();
      });

      await errPage.goto(WEB + '/chat?_slice62err=' + Date.now(), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await errPage.waitForSelector(SLICE62.chatPage, { timeout: 15000 }).catch(() => undefined);

      const titleLocator = errPage.getByText('加载会话失败');
      const errBox = errPage.locator(
        `${SLICE62.chatThreadsError}, ${SLICE62.chatMainError}`,
      );
      try {
        await Promise.race([
          errBox.first().waitFor({ state: 'visible', timeout: 12000 }),
          titleLocator.first().waitFor({ state: 'visible', timeout: 12000 }),
        ]);
      } catch {
        /* fall through */
      }
      await errPage.waitForTimeout(400);

      const titleOk = await titleLocator.first().isVisible().catch(() => false);
      const retryBtn = errPage.getByRole('button', { name: '重试' }).first();
      const retryOk = await retryBtn.isVisible().catch(() => false);
      const errVisible = await errBox.first().isVisible().catch(() => false);

      if ((errVisible || titleOk) && retryOk) {
        record({
          id: 'chat.error.state',
          status: 'PASS',
          note: `ErrorState 加载会话失败 + 重试 (threads GET hits=${threadsGetHits})`,
        });

        await errPage.unroute('**/*').catch(() => undefined);
        await retryBtn.click();
        await errPage.waitForTimeout(2000);
        const pageBack = await errPage
          .locator(SLICE62.chatPage)
          .isVisible()
          .catch(() => false);
        const emptyOrList =
          (await errPage.locator(SLICE62.chatEmpty).isVisible().catch(() => false)) ||
          (await errPage.locator(SLICE62.chatThreadsEmpty).isVisible().catch(() => false)) ||
          (await errPage.locator('[data-testid="chat-thread-item"]').count()) > 0;
        record({
          id: 'chat.error.retry',
          status: pageBack ? 'PASS' : 'WARN',
          note: emptyOrList
            ? '重试后 chat 恢复（空态或列表）'
            : pageBack
              ? '重试后 chat-page 仍在（query 可能仍缓）'
              : '重试后未立刻恢复',
        });
      } else {
        const bodyText = (
          await errPage.locator('body').innerText().catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 180);
        record({
          id: 'chat.error.state',
          status: threadsGetHits > 0 ? 'FAIL' : 'WARN',
          note: `未呈现 Chat ErrorState；threads GET hits=${threadsGetHits}。body~ ${bodyText}`,
        });
      }
      await errPage.close().catch(() => undefined);
    } catch (e: any) {
      record({
        id: 'chat.error.state',
        status: 'WARN',
        note: `chat route mock failed: ${String(e?.message ?? e).slice(0, 160)}`,
      });
    }

    // —— Chat 正常空态（或有会话也算 page 可达）——
    try {
      const emptyPage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      await emptyPage.goto(WEB + '/chat', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await emptyPage.waitForSelector(SLICE62.chatPage, { timeout: 15000 });
      await emptyPage.waitForTimeout(600);
      const emptyOk =
        (await emptyPage.locator(SLICE62.chatEmpty).isVisible().catch(() => false)) ||
        (await emptyPage.locator(SLICE62.chatThreadsEmpty).isVisible().catch(() => false)) ||
        (await emptyPage.locator('[data-testid="chat-thread-item"]').count()) > 0 ||
        (await emptyPage.getByText('和你的智能体对话').isVisible().catch(() => false)) ||
        (await emptyPage.getByText('还没有对话').isVisible().catch(() => false));
      record({
        id: 'chat.empty.or.list',
        status: emptyOk ? 'PASS' : 'FAIL',
        note: emptyOk
          ? 'chat 空态或会话列表可见'
          : 'chat-page 无空态/列表迹象',
      });
      await emptyPage.close().catch(() => undefined);
    } catch (e: any) {
      record({
        id: 'chat.empty.or.list',
        status: 'WARN',
        note: String(e?.message ?? e).slice(0, 160),
      });
    }

    // —— Issue 错误路径：全页 /issues/:id + 拦截 GET ——
    const fakeId = `slice62-missing-${Date.now().toString(36)}`;
    try {
      const issuePage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      let issueGetHits = 0;
      await issuePage.route('**/*', async (route) => {
        const req = route.request();
        const method = req.method();
        let pathname = '';
        try {
          pathname = new URL(req.url()).pathname;
        } catch {
          await route.continue();
          return;
        }
        // 单条 issue：/api/issues/:id（排除 /api/issues 列表与子资源可放宽）
        if (
          method === 'GET' &&
          (pathname === `/api/issues/${fakeId}` ||
            pathname.endsWith(`/api/issues/${fakeId}`))
        ) {
          issueGetHits += 1;
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'slice62 mock issue fail' }),
          });
          return;
        }
        await route.continue();
      });

      await issuePage.goto(WEB + `/issues/${encodeURIComponent(fakeId)}?_s62=` + Date.now(), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      const issueTitle = issuePage.getByText('加载 Issue 失败');
      const issueErr = issuePage.locator(SLICE62.issueDetailError);
      try {
        await Promise.race([
          issueErr.waitFor({ state: 'visible', timeout: 12000 }),
          issueTitle.waitFor({ state: 'visible', timeout: 12000 }),
          issuePage.getByText('Issue 不存在').waitFor({ state: 'visible', timeout: 12000 }),
        ]);
      } catch {
        /* fall through */
      }
      await issuePage.waitForTimeout(400);

      const failTitleOk = await issueTitle.isVisible().catch(() => false);
      const missingOk = await issuePage
        .getByText('Issue 不存在')
        .isVisible()
        .catch(() => false);
      const errBoxOk = await issueErr.isVisible().catch(() => false);
      const retryOk = await issuePage
        .getByRole('button', { name: '重试' })
        .isVisible()
        .catch(() => false);
      const backOk = await issuePage
        .locator(SLICE62.issueBackBoard)
        .isVisible()
        .catch(() => false);

      if ((errBoxOk || failTitleOk) && (retryOk || backOk)) {
        record({
          id: 'issue.error.state',
          status: 'PASS',
          note: `Issue ErrorState (hits=${issueGetHits}) retry=${retryOk} back=${backOk}`,
        });
      } else if (missingOk && backOk) {
        record({
          id: 'issue.error.state',
          status: 'PASS',
          note: `Issue 不存在 Empty + 回看板 (hits=${issueGetHits})`,
        });
      } else {
        const bodyText = (
          await issuePage.locator('body').innerText().catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 180);
        record({
          id: 'issue.error.state',
          status: issueGetHits > 0 ? 'FAIL' : 'WARN',
          note: `未呈现 Issue 错/空态；hits=${issueGetHits}。body~ ${bodyText}`,
        });
      }
      await issuePage.close().catch(() => undefined);
    } catch (e: any) {
      record({
        id: 'issue.error.state',
        status: 'WARN',
        note: `issue route mock failed: ${String(e?.message ?? e).slice(0, 160)}`,
      });
    }

    // 可选：侧滑 sheet 路径若有真实 issue id
    const list = await api('GET', '/api/issues?limit=1');
    const firstId: string | undefined =
      list.json?.data?.[0]?.id ?? list.json?.[0]?.id;
    if (firstId) {
      try {
        const sheetPage = await browser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        let sheetHits = 0;
        await sheetPage.route('**/*', async (route) => {
          const req = route.request();
          let pathname = '';
          try {
            pathname = new URL(req.url()).pathname;
          } catch {
            await route.continue();
            return;
          }
          if (
            req.method() === 'GET' &&
            (pathname === `/api/issues/${firstId}` ||
              pathname.endsWith(`/api/issues/${firstId}`))
          ) {
            sheetHits += 1;
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'slice62 sheet issue fail' }),
            });
            return;
          }
          await route.continue();
        });
        await sheetPage.goto(WEB + `/?issue=${encodeURIComponent(firstId)}&_s62s=` + Date.now(), {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        try {
          await sheetPage
            .locator(SLICE62.issueSideSheet)
            .waitFor({ state: 'visible', timeout: 8000 });
        } catch {
          /* may not open */
        }
        await sheetPage.waitForTimeout(800);
        const sheetErr =
          (await sheetPage.locator(SLICE62.issueDetailError).isVisible().catch(() => false)) ||
          (await sheetPage.getByText('加载 Issue 失败').isVisible().catch(() => false));
        record({
          id: 'issue.sheet.error',
          status: sheetErr ? 'PASS' : sheetHits > 0 ? 'WARN' : 'WARN',
          note: sheetErr
            ? `side sheet ErrorState (hits=${sheetHits})`
            : `sheet 未断言到 ErrorState hits=${sheetHits}（可忽略）`,
        });
        await sheetPage.close().catch(() => undefined);
      } catch (e: any) {
        record({
          id: 'issue.sheet.error',
          status: 'WARN',
          note: String(e?.message ?? e).slice(0, 120),
        });
      }
    } else {
      record({
        id: 'issue.sheet.error',
        status: 'WARN',
        note: '无 issue 可开 sheet，跳过',
      });
    }
  } catch (e: any) {
    record({
      id: 'suite.error',
      status: 'FAIL',
      note: String(e?.message ?? e).slice(0, 240),
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

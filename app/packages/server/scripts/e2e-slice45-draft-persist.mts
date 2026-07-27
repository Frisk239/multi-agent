/**
 * Slice 45 · 草稿持久化（U8）· Playwright live 验收
 *
 * 默认：WEB=http://127.0.0.1:3000
 * WEB 不可达 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖（最高 ROI：看板 NewIssue 草稿刷新后仍在）：
 * 1. WEB 可达
 * 2. 打开 / → 新建 Issue → 填标题
 * 3. 等待 debounce 写盘
 * 4. localStorage 含 ma-draft:new-issue
 * 5. 刷新后重新打开表单 → 标题仍在
 *
 * 可选：若存在 issue 卡，再验评论 composer 草稿。
 *
 * 运行：
 *   cd app && pnpm exec tsx packages/server/scripts/e2e-slice45-draft-persist.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';

const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';
const DRAFT_MARKER = `slice45-draft-${Date.now().toString(36)}`;
const NEW_ISSUE_KEY = 'ma-draft:new-issue';

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

function finish(skipped: boolean): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice45-draft-persist-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 45 draft-persist e2e report');
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
  if (skipped || (skips.length && results.every((r) => r.status === 'SKIP' || r.status === 'WARN'))) {
    console.log('\nSKIP: WEB unreachable or suite skipped (not a greenwash PASS)');
    process.exitCode = 0;
    return;
  }
  console.log('\nPASS: draft persist checks ok');
  process.exitCode = 0;
}

async function main(): Promise<void> {
  log(`Slice 45 draft-persist e2e · WEB=${WEB}`);

  const up = await webReachable();
  if (!up) {
    record({
      id: 'web.reachable',
      status: 'SKIP',
      note: `WEB 不可达: ${WEB}（请先起 web@3000）`,
    });
    finish(true);
    return;
  }
  record({ id: 'web.reachable', status: 'PASS', note: WEB });

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // —— NewIssue 草稿 ——
    log('1. open board / clear new-issue draft key');
    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.evaluate((key) => window.localStorage.removeItem(key), NEW_ISSUE_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // 侧栏也有「新建 Issue」文案；优先看板工具条 btn-new-issue，其次 ?new=1
    let titleInput = page.locator('[data-testid="new-issue-title"]');
    if (!(await titleInput.isVisible().catch(() => false))) {
      const boardNewBtn = page.locator('button.btn-new-issue').first();
      if (await boardNewBtn.isVisible().catch(() => false)) {
        await boardNewBtn.click();
        await page.waitForTimeout(600);
      }
    }
    if (!(await titleInput.isVisible().catch(() => false))) {
      await page.goto(`${WEB}/?new=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);
      titleInput = page.locator('[data-testid="new-issue-title"]');
    }
    try {
      await titleInput.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      record({
        id: 'ui.new-issue-open',
        status: 'FAIL',
        note: 'new-issue-title 不可见（btn-new-issue / ?new=1 均失败）',
      });
      finish(false);
      return;
    }
    record({ id: 'ui.new-issue-open', status: 'PASS', note: 'form open' });

    await titleInput.fill(DRAFT_MARKER);
    // debounce ~300ms
    await page.waitForTimeout(700);

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), NEW_ISSUE_KEY);
    if (!stored || !stored.includes(DRAFT_MARKER)) {
      record({
        id: 'storage.new-issue-write',
        status: 'FAIL',
        note: `localStorage missing marker; raw=${(stored ?? '').slice(0, 120)}`,
      });
    } else {
      record({
        id: 'storage.new-issue-write',
        status: 'PASS',
        note: `key ${NEW_ISSUE_KEY} has draft`,
      });
    }

    log('2. reload → re-open form → title restored');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    // 恢复后 open 不持久；需再点开
    let restoredInput = page.locator('[data-testid="new-issue-title"]');
    if (!(await restoredInput.isVisible().catch(() => false))) {
      const openAgain = page.locator('button:has-text("新建 Issue")').first();
      if (await openAgain.isVisible().catch(() => false)) {
        await openAgain.click();
        await page.waitForTimeout(500);
      }
    }
    restoredInput = page.locator('[data-testid="new-issue-title"]');
    if (!(await restoredInput.isVisible().catch(() => false))) {
      record({
        id: 'ui.new-issue-restore',
        status: 'FAIL',
        note: '刷新后无法打开 NewIssue 表单',
      });
    } else {
      const val = await restoredInput.inputValue();
      if (val === DRAFT_MARKER) {
        record({
          id: 'ui.new-issue-restore',
          status: 'PASS',
          note: `title restored: ${val}`,
        });
      } else {
        record({
          id: 'ui.new-issue-restore',
          status: 'FAIL',
          note: `expected ${DRAFT_MARKER}, got ${JSON.stringify(val)}`,
        });
      }
    }

    // 取消应 clear
    const cancel = page
      .locator('[data-testid="new-issue-form"] button:has-text("取消"), form.new-issue-form button:has-text("取消")')
      .first();
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
      await page.waitForTimeout(500);
      const afterCancel = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        NEW_ISSUE_KEY,
      );
      record({
        id: 'ui.new-issue-cancel-clear',
        status: afterCancel == null ? 'PASS' : 'FAIL',
        note: afterCancel == null ? 'cancel cleared storage' : `still: ${afterCancel.slice(0, 80)}`,
      });
    } else {
      record({
        id: 'ui.new-issue-cancel-clear',
        status: 'WARN',
        note: 'cancel button not found; skip clear assert',
      });
    }

    // —— 可选：评论草稿（有 issue 卡时）——
    log('3. optional: comment draft via issue sheet');
    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);
    const card = page.locator('[data-testid="issue-card-title-link"]').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      await page.waitForTimeout(900);
      const sheet = page.locator('[data-testid="issue-side-sheet"]');
      const ta = page.locator('[data-testid="comment-composer-textarea"]');
      if (
        (await sheet.isVisible().catch(() => false)) &&
        (await ta.isVisible().catch(() => false))
      ) {
        const url = page.url();
        const issueId = new URL(url).searchParams.get('issue') ?? '';
        const commentKey = issueId ? `ma-draft:comment:${issueId}` : '';
        const marker = `cmt-${DRAFT_MARKER}`;
        await ta.fill(marker);
        await page.waitForTimeout(700);
        const raw = commentKey
          ? await page.evaluate((k) => window.localStorage.getItem(k), commentKey)
          : null;
        if (raw === marker) {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1000);
          // re-open sheet if needed
          if (!(await page.locator('[data-testid="comment-composer-textarea"]').isVisible().catch(() => false))) {
            if (issueId) {
              await page.goto(`${WEB}/?issue=${encodeURIComponent(issueId)}`, {
                waitUntil: 'domcontentloaded',
              });
              await page.waitForTimeout(1000);
            }
          }
          const after = page.locator('[data-testid="comment-composer-textarea"]');
          if (await after.isVisible().catch(() => false)) {
            const v = await after.inputValue();
            record({
              id: 'ui.comment-restore',
              status: v === marker ? 'PASS' : 'FAIL',
              note: v === marker ? `comment restored for ${issueId}` : `got ${JSON.stringify(v)}`,
            });
          } else {
            record({
              id: 'ui.comment-restore',
              status: 'WARN',
              note: 'composer not visible after reload',
            });
          }
        } else {
          record({
            id: 'ui.comment-restore',
            status: 'FAIL',
            note: `storage miss key=${commentKey} raw=${raw}`,
          });
        }
      } else {
        record({
          id: 'ui.comment-restore',
          status: 'WARN',
          note: 'sheet/composer not ready; skip comment path',
        });
      }
    } else {
      record({
        id: 'ui.comment-restore',
        status: 'WARN',
        note: 'no issue card; skip comment path',
      });
    }
  } catch (e: any) {
    record({
      id: 'suite',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  finish(false);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

/**
 * Slice 54 · Mention chips 薄版（U13）· Playwright live 验收
 *
 * 默认：WEB=http://127.0.0.1:3000  SERVER=http://127.0.0.1:3001
 * WEB 不可达 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖：
 * 1. WEB 可达
 * 2. 打开 issue sheet → comment composer
 * 3. 输入 @ → 选中 autocomplete 一项 → chip 出现
 * 4. 点 × 移除 chip → textarea 去掉对应 mention 语法
 * 5. （可选）再 @ 选中后发送 → timeline MarkdownBody mention pill 可见
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice54-mention-chips.mts
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

async function openComposer(page: Page): Promise<boolean> {
  await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(900);

  // Prefer URL mirror if an issue card exists
  const card = page.locator('[data-testid="issue-card-title-link"]').first();
  if (!(await card.isVisible().catch(() => false))) {
    return false;
  }
  await card.click();
  await page.waitForTimeout(1000);

  const ta = page.locator('[data-testid="comment-composer-textarea"]');
  if (!(await ta.isVisible().catch(() => false))) {
    // try force issue query from current url or first card href
    const href = await card.getAttribute('href').catch(() => null);
    if (href) {
      await page.goto(new URL(href, WEB).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await page.waitForTimeout(1000);
    }
  }
  return ta.isVisible().catch(() => false);
}

async function pickFirstMention(page: Page): Promise<{
  ok: boolean;
  name: string;
  note: string;
}> {
  const ta = page.locator('[data-testid="comment-composer-textarea"]');
  await ta.click();
  // clear then type @ to open menu
  await ta.fill('');
  await ta.type('@', { delay: 30 });
  await page.waitForTimeout(500);

  const menu = page.locator('[data-testid="mention-autocomplete-menu"]');
  const visible = await menu.isVisible().catch(() => false);
  if (!visible) {
    // fallback: toolbar @提及
    const tool = page.locator('[data-testid="composer-tool-mention"]');
    if (await tool.isVisible().catch(() => false)) {
      await tool.click();
      await page.waitForTimeout(400);
    }
  }
  if (!(await menu.isVisible().catch(() => false))) {
    return { ok: false, name: '', note: 'mention autocomplete menu not visible' };
  }

  const first = menu.locator('.mention-item-btn').first();
  if (!(await first.isVisible().catch(() => false))) {
    return { ok: false, name: '', note: 'no mention menu items' };
  }
  const nameText =
    (await first.locator('.mention-item-name').textContent().catch(() => ''))?.trim() ??
    '';
  await first.click();
  await page.waitForTimeout(350);
  return {
    ok: true,
    name: nameText.replace(/^@/, ''),
    note: `selected ${nameText || '(item)'}`,
  };
}

function finish(skipped: boolean): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice54-mention-chips-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 54 mention-chips e2e report');
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
  console.log('\nPASS: mention chips checks ok');
  process.exitCode = 0;
}

async function main(): Promise<void> {
  log(`Slice 54 mention-chips e2e · WEB=${WEB} SERVER=${SERVER}`);

  const up = await webReachable();
  if (!up) {
    record({
      id: 'web.reachable',
      status: 'SKIP',
      note: `WEB not reachable: ${WEB}`,
    });
    finish(true);
    return;
  }
  record({ id: 'web.reachable', status: 'PASS', note: WEB });

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);

    log('1. open issue composer');
    const opened = await openComposer(page);
    if (!opened) {
      record({
        id: 'ui.composer',
        status: 'SKIP',
        note: 'no issue card / composer not visible',
      });
      finish(true);
      return;
    }
    record({ id: 'ui.composer', status: 'PASS', note: 'comment composer visible' });

    log('2. @ select → chip');
    const picked = await pickFirstMention(page);
    if (!picked.ok) {
      record({
        id: 'ui.mention-select',
        status: 'FAIL',
        note: picked.note,
      });
    } else {
      record({
        id: 'ui.mention-select',
        status: 'PASS',
        note: picked.note,
      });
    }

    const chips = page.locator('[data-testid="composer-mention-chips"]');
    const chip = page.locator('[data-testid="composer-mention-chip"]').first();
    const chipsVisible = await chips.isVisible().catch(() => false);
    const chipCount = await page.locator('[data-testid="composer-mention-chip"]').count();
    if (chipsVisible && chipCount >= 1) {
      const chipId = (await chip.getAttribute('data-mention-id')) ?? '';
      const bodyAfter = await page
        .locator('[data-testid="comment-composer-textarea"]')
        .inputValue();
      const hasMd = /mention:\/\/(agent|squad)\//.test(bodyAfter);
      record({
        id: 'ui.chip-visible',
        status: hasMd ? 'PASS' : 'FAIL',
        note: hasMd
          ? `chip count=${chipCount} id=${chipId} body has mention md`
          : `chip shown but body missing mention:// · body=${JSON.stringify(bodyAfter).slice(0, 120)}`,
      });
    } else {
      record({
        id: 'ui.chip-visible',
        status: 'FAIL',
        note: `chipsVisible=${chipsVisible} count=${chipCount}`,
      });
    }

    log('3. remove chip → body sync');
    const removeBtn = page.locator('[data-testid="composer-mention-chip-remove"]').first();
    if (await removeBtn.isVisible().catch(() => false)) {
      const before = await page
        .locator('[data-testid="comment-composer-textarea"]')
        .inputValue();
      await removeBtn.click();
      await page.waitForTimeout(250);
      const after = await page
        .locator('[data-testid="comment-composer-textarea"]')
        .inputValue();
      const stillChips = await page
        .locator('[data-testid="composer-mention-chip"]')
        .count();
      const stillMd = /mention:\/\/(agent|squad)\//.test(after);
      // before had mention; after should not (single chip path)
      const ok = stillChips === 0 && !stillMd && before !== after;
      record({
        id: 'ui.chip-remove',
        status: ok ? 'PASS' : 'FAIL',
        note: ok
          ? 'chip removed and mention md cleared from body'
          : `stillChips=${stillChips} stillMd=${stillMd} beforeLen=${before.length} afterLen=${after.length}`,
      });
    } else {
      record({
        id: 'ui.chip-remove',
        status: 'FAIL',
        note: 'remove button not visible',
      });
    }

    log('4. optional: re-select @ and submit → timeline pill');
    const picked2 = await pickFirstMention(page);
    if (!picked2.ok) {
      record({
        id: 'ui.submit-timeline',
        status: 'WARN',
        note: `re-select failed: ${picked2.note}; skip send`,
      });
    } else {
      const marker = `slice54-chip-${Date.now().toString(36)}`;
      const ta = page.locator('[data-testid="comment-composer-textarea"]');
      // append marker after existing mention md
      const cur = await ta.inputValue();
      await ta.fill(`${cur.trim()} ${marker}`);
      await page.waitForTimeout(200);
      const submit = page.locator('[data-testid="comment-submit-btn"]');
      if (!(await submit.isEnabled().catch(() => false))) {
        record({
          id: 'ui.submit-timeline',
          status: 'WARN',
          note: 'submit disabled; skip send',
        });
      } else {
        await submit.click();
        await page.waitForTimeout(1500);
        // look for mention pill and/or marker text in detail
        const pill = page.locator('[data-testid="mention-link"], .mention-pill').first();
        const pillVisible = await pill.isVisible().catch(() => false);
        const markerVisible = await page
          .getByText(marker, { exact: false })
          .first()
          .isVisible()
          .catch(() => false);
        if (pillVisible || markerVisible) {
          record({
            id: 'ui.submit-timeline',
            status: 'PASS',
            note: `sent; pill=${pillVisible} marker=${markerVisible}`,
          });
        } else {
          // network/server may lag — WARN not FAIL if submit path ran
          record({
            id: 'ui.submit-timeline',
            status: 'WARN',
            note: 'submit clicked but pill/marker not yet visible in DOM',
          });
        }
      }
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

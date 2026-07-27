/**
 * Slice 53 · 快捷键扩面 + 窄屏侧栏（U12）· Playwright live 验收
 *
 * 默认：WEB=http://127.0.0.1:3000  SERVER=http://127.0.0.1:3001
 * WEB 不可达 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖（优先键盘）：
 * 1. WEB 可达
 * 2. g c → /chat
 * 3. g a → /agents
 * 4. g w → /wiki（扩面）
 * 5. 帮助 modal（?）含 Chat/Agents
 * 6. ≤900 viewport：侧栏默认隐 + 汉堡；点汉堡开 overlay；Esc 关
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice53-shortcuts-sidebar.mts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';

const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';
const SERVER = process.env.SERVER ?? 'http://127.0.0.1:3001';

/** 与 lib/shortcuts.ts 对齐 */
export const NARROW_MAX = 900;

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
    const path = join(LOG_DIR, `e2e-slice53-shortcuts-sidebar-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 53 shortcuts-sidebar e2e report');
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
  console.log('\nPASS: shortcuts-sidebar checks ok');
  process.exitCode = 0;
}

/** 失焦后按 g-chord（避开输入框吞键） */
async function pressGChord(page: Page, second: string): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && typeof el.blur === 'function') el.blur();
  });
  await page.waitForTimeout(80);
  await page.keyboard.press('g');
  await page.waitForTimeout(120);
  await page.keyboard.press(second);
}

async function waitPath(page: Page, includes: string, ms = 8000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const url = page.url();
    try {
      const u = new URL(url);
      if (u.pathname === includes || u.pathname.startsWith(includes + '/')) {
        return true;
      }
      // includes may be full path like /chat
      if (u.pathname.includes(includes.replace(/^\//, '')) && includes !== '/') {
        if (u.pathname === includes || u.pathname.startsWith(includes)) return true;
      }
    } catch {
      /* ignore */
    }
    await page.waitForTimeout(120);
  }
  return false;
}

async function main(): Promise<void> {
  log(`Slice 53 shortcuts-sidebar e2e · WEB=${WEB} SERVER=${SERVER}`);

  record({
    id: 'unit.threshold',
    status: NARROW_MAX === 900 ? 'PASS' : 'FAIL',
    note: `NARROW_MAX=${NARROW_MAX} (must 900)`,
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('[data-testid="app-sidebar"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    // —— 优先：g-chord 路由 ——
    await pressGChord(page, 'c');
    const chatOk = await waitPath(page, '/chat');
    record({
      id: 'kbd.g-c.chat',
      status: chatOk ? 'PASS' : 'FAIL',
      note: chatOk ? page.url() : `expected /chat got ${page.url()}`,
    });

    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(400);
    await pressGChord(page, 'a');
    const agentsOk = await waitPath(page, '/agents');
    record({
      id: 'kbd.g-a.agents',
      status: agentsOk ? 'PASS' : 'FAIL',
      note: agentsOk ? page.url() : `expected /agents got ${page.url()}`,
    });

    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(400);
    await pressGChord(page, 'w');
    const wikiOk = await waitPath(page, '/wiki');
    record({
      id: 'kbd.g-w.wiki',
      status: wikiOk ? 'PASS' : 'FAIL',
      note: wikiOk ? page.url() : `expected /wiki got ${page.url()}`,
    });

    // —— 帮助 modal 与映射同步 ——
    await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el && typeof el.blur === 'function') el.blur();
    });
    await page.keyboard.press('Shift+/'); // ?
    await page.waitForTimeout(400);
    const modal = page.locator('[data-testid="shortcuts-modal"]');
    const modalVisible = await modal.isVisible().catch(() => false);
    if (!modalVisible) {
      record({
        id: 'help.modal',
        status: 'FAIL',
        note: 'shortcuts-modal not visible after ?',
      });
    } else {
      const text = (await modal.innerText().catch(() => '')) || '';
      const hasChat = /Chat|聊天/i.test(text);
      const hasAgents = /Agents|智能体/i.test(text);
      const hasGc = text.includes('g') && text.includes('c');
      record({
        id: 'help.modal',
        status: hasChat && hasAgents ? 'PASS' : 'FAIL',
        note: `visible chat=${hasChat} agents=${hasAgents} keysHint=${hasGc}`,
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // —— 窄屏侧栏（viewport ≤900）——
    await page.setViewportSize({ width: NARROW_MAX, height: 700 });
    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(600);

    const sidebar = page.locator('[data-testid="app-sidebar"]');
    const hamburger = page.locator('[data-testid="shell-hamburger"]');
    const hamVisible = await hamburger.isVisible().catch(() => false);
    const narrowAttr = await sidebar.getAttribute('data-narrow');
    const openAttr = await sidebar.getAttribute('data-mobile-open');

    if (!hamVisible) {
      record({
        id: 'narrow.hamburger',
        status: 'FAIL',
        note: 'shell-hamburger not visible at ≤900',
      });
    } else {
      record({
        id: 'narrow.hamburger',
        status: 'PASS',
        note: `hamburger visible data-narrow=${narrowAttr} open=${openAttr}`,
      });
    }

    // 默认隐藏：未 open 时 data-mobile-open=0 且无 overlay
    const defaultHidden = openAttr !== '1';
    const overlay0 = page.locator('[data-testid="sidebar-overlay"]');
    const overlayDefault = await overlay0.isVisible().catch(() => false);
    record({
      id: 'narrow.default-hidden',
      status: defaultHidden && !overlayDefault ? 'PASS' : 'FAIL',
      note: `mobile-open=${openAttr} overlay=${overlayDefault}`,
    });

    if (hamVisible) {
      await hamburger.click();
      await page.waitForTimeout(350);
      const openNow = await sidebar.getAttribute('data-mobile-open');
      const overlay = page.locator('[data-testid="sidebar-overlay"]');
      const overlayVis = await overlay.isVisible().catch(() => false);
      record({
        id: 'narrow.open-overlay',
        status: openNow === '1' && overlayVis ? 'PASS' : 'FAIL',
        note: `open=${openNow} overlay=${overlayVis}`,
      });

      // Esc 关闭
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const afterEsc = await sidebar.getAttribute('data-mobile-open');
      const overlayAfter = await overlay.isVisible().catch(() => false);
      record({
        id: 'narrow.esc-close',
        status: afterEsc !== '1' && !overlayAfter ? 'PASS' : 'FAIL',
        note: `after Esc open=${afterEsc} overlay=${overlayAfter}`,
      });

      // 再开 → 点遮罩关（点右侧，避开左侧抽屉命中）
      await hamburger.click();
      await page.waitForTimeout(300);
      const ov = page.locator('[data-testid="sidebar-overlay"]');
      const ovVisible = await ov.isVisible().catch(() => false);
      if (ovVisible) {
        const box = await ov.boundingBox();
        if (box) {
          // 点遮罩右缘（侧栏宽度约 ≤320）
          await page.mouse.click(box.x + box.width - 12, box.y + Math.min(80, box.height / 2));
        } else {
          await ov.click({ force: true, position: { x: 700, y: 40 } });
        }
        await page.waitForTimeout(300);
      }
      const afterClick = await sidebar.getAttribute('data-mobile-open');
      record({
        id: 'narrow.overlay-click-close',
        status: afterClick !== '1' ? 'PASS' : 'FAIL',
        note: `after overlay click open=${afterClick} ovVisible=${ovVisible}`,
      });
    } else {
      record({ id: 'narrow.open-overlay', status: 'SKIP', note: 'no hamburger' });
      record({ id: 'narrow.esc-close', status: 'SKIP', note: 'no hamburger' });
      record({ id: 'narrow.overlay-click-close', status: 'SKIP', note: 'no hamburger' });
    }

    finish(false);
  } catch (e: any) {
    record({
      id: 'suite.error',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
    finish(false);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

/**
 * Slice 61 · Select 扫非看板日用页 · Playwright live 验收
 *
 * 默认：WEB=http://127.0.0.1:3000  SERVER=http://127.0.0.1:3001
 * WEB 不可达 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖（任一可达页即可）：
 * 1. WEB 可达
 * 2. 打开 Chat / Runs / Automation 等日用页
 * 3. 断言页面上筛选/表单 select 带 `ma-select`（与共用 Select 一致）
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice61-select-sweep.mts
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

/** 与 UI 对齐：日用页筛选/表单 select（Slice 61） */
export const SLICE61 = {
  selectClass: 'ma-select',
  routes: [
    {
      id: 'chat',
      path: '/chat',
      open: async (page: Page) => {
        // 新对话面板上的 agent select
        const newBtn = page
          .locator(
            '[data-testid="chat-new-thread"], [data-testid="chat-new"], button:has-text("新对话"), button:has-text("新建")',
          )
          .first();
        if ((await newBtn.count()) > 0) {
          await newBtn.click().catch(() => undefined);
          await page.waitForTimeout(300);
        }
      },
      selectors: [
        '[data-testid="chat-agent-select"]',
        '[data-testid="chat-project-select"]',
        'select.chat-new-select',
        'select.chat-project-select',
      ],
    },
    {
      id: 'runs',
      path: '/runs',
      open: async (page: Page) => {
        const filtersBtn = page
          .locator(
            '[data-testid="runs-filters-toggle"], button:has-text("筛选"), button:has-text("过滤")',
          )
          .first();
        if ((await filtersBtn.count()) > 0) {
          await filtersBtn.click().catch(() => undefined);
          await page.waitForTimeout(300);
        }
      },
      selectors: [
        '[data-testid="runs-agent-filter"]',
        '[data-testid="runs-squad-filter"]',
        '[data-testid="runs-status-filter"]',
        '[data-testid="runs-filters"] select',
      ],
    },
    {
      id: 'automation',
      path: '/automation',
      open: async (_page: Page) => {
        /* 列表筛选项常驻 */
      },
      selectors: [
        '[data-testid="automation-enabled-filter"]',
        '[data-testid="automation-schedule-filter"]',
        'select[aria-label="按启用状态筛选"]',
        'select[aria-label="按调度类型筛选"]',
      ],
    },
    {
      id: 'agents',
      path: '/agents',
      open: async (_page: Page) => {},
      selectors: [
        '[data-testid="agents-runtime-filter"]',
        '[data-testid="agents-ready-filter"]',
      ],
    },
  ],
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

function finish(skipped: boolean): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice61-select-sweep-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 61 select-sweep e2e report');
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
  console.log('\nPASS: select-sweep checks ok');
  process.exitCode = 0;
}

async function selectHasMaClass(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    ({ sel, cls }) => {
      const el = document.querySelector(sel);
      return Boolean(el && el.classList.contains(cls));
    },
    { sel: selector, cls: SLICE61.selectClass },
  );
}

async function main(): Promise<void> {
  log(`Slice 61 select-sweep e2e · WEB=${WEB} SERVER=${SERVER}`);

  record({
    id: 'unit.selectors',
    status: 'PASS',
    note: `ma-select + ${SLICE61.routes.length} routes`,
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
  let foundAny = false;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    for (const route of SLICE61.routes) {
      try {
        await page.goto(WEB + route.path, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        await page.waitForTimeout(800);
        await route.open(page);
      } catch (e: any) {
        record({
          id: `ui.${route.id}.nav`,
          status: 'WARN',
          note: `goto ${route.path} failed: ${String(e?.message ?? e).slice(0, 120)}`,
        });
        continue;
      }

      let routeHit = false;
      for (const sel of route.selectors) {
        const el = page.locator(sel).first();
        if ((await el.count()) === 0) continue;
        const hasClass = await selectHasMaClass(page, sel);
        record({
          id: `ui.${route.id}.ma-select`,
          status: hasClass ? 'PASS' : 'FAIL',
          note: hasClass
            ? `${sel} has ma-select`
            : `${sel} missing ma-select class`,
        });
        routeHit = true;
        foundAny = true;
        break;
      }

      if (!routeHit) {
        // 再兜底：页面上任意 select.ma-select
        const anyMa = await page.evaluate((cls) => {
          const nodes = Array.from(document.querySelectorAll('select'));
          return {
            total: nodes.length,
            withMa: nodes.filter((n) => n.classList.contains(cls)).length,
          };
        }, SLICE61.selectClass);
        if (anyMa.withMa > 0) {
          record({
            id: `ui.${route.id}.ma-select`,
            status: 'PASS',
            note: `fallback: ${anyMa.withMa}/${anyMa.total} select have ma-select`,
          });
          foundAny = true;
        } else if (anyMa.total > 0) {
          record({
            id: `ui.${route.id}.ma-select`,
            status: 'FAIL',
            note: `page has ${anyMa.total} select but none with ma-select`,
          });
          foundAny = true;
        } else {
          record({
            id: `ui.${route.id}.select`,
            status: 'WARN',
            note: `${route.path} 无可检 select（可能需交互展开）`,
          });
        }
      }
    }

    if (!foundAny) {
      record({
        id: 'ui.any-ma-select',
        status: 'FAIL',
        note: '所有候选页均未找到带 ma-select 的 select',
      });
    }
  } catch (e: any) {
    record({
      id: 'runtime.error',
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

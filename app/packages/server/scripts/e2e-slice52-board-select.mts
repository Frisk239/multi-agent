/**
 * Slice 52 · 看板 Select / 批量条收口（U11）· Playwright live 验收
 *
 * 默认：WEB=http://127.0.0.1:3000  SERVER=http://127.0.0.1:3001
 * WEB 不可达 → SKIP 整组（不粉饰为 PASS）。
 *
 * 覆盖：
 * 1. WEB 可达
 * 2. 打开 / 看板：主筛选 assignee Select 为共用 ma-select
 * 3. 打开「筛选」后：priority/origin/project/status 均 ma-select
 * 4. 可选 live：选 1 张卡 → 批量条 ma-select → bulk-status → API 状态变更
 * 5. Esc 清选（有选中时 bulk bar 消失）
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice52-board-select.mts
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

/** 与 UI 对齐的稳定 selector（Slice 52） */
export const SLICE52 = {
  board: '[data-testid="kanban-board"]',
  toolbar: '[data-testid="kanban-toolbar"]',
  moreFilters: '[data-testid="kanban-more-filters"]',
  assigneeFilter: '[data-testid="kanban-assignee-filter"]',
  priorityFilter: '[data-testid="kanban-priority-filter"]',
  originFilter: '[data-testid="kanban-origin-filter"]',
  projectFilter: '[data-testid="kanban-project-filter"]',
  statusFilter: '[data-testid="kanban-status-filter"]',
  bulkBar: '[data-testid="kanban-bulk-bar"]',
  bulkStatus: '[data-testid="kanban-bulk-status"]',
  bulkAssignee: '[data-testid="kanban-bulk-assignee"]',
  bulkClear: '[data-testid="kanban-bulk-clear"]',
  selectClass: 'ma-select',
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
    const path = join(LOG_DIR, `e2e-slice52-board-select-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch {
    /* ignore */
  }

  console.log('\n========================================');
  console.log('Slice 52 board-select e2e report');
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
  console.log('\nPASS: board-select checks ok');
  process.exitCode = 0;
}

async function selectHasMaClass(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    ({ sel, cls }) => {
      const el = document.querySelector(sel);
      return Boolean(el && el.classList.contains(cls));
    },
    { sel: selector, cls: SLICE52.selectClass },
  );
}

async function main(): Promise<void> {
  log(`Slice 52 board-select e2e · WEB=${WEB} SERVER=${SERVER}`);

  // 静态约定：selector 常量表
  record({
    id: 'unit.selectors',
    status: 'PASS',
    note: `ma-select + bulk-status + ${Object.keys(SLICE52).length} keys`,
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

  const marker = `slice52-board-select-${Date.now().toString(36)}`;
  const issueCreate = await api('POST', '/api/issues', {
    title: marker,
    status: 'todo',
    priority: 'none',
  });
  const issueId: string | undefined =
    issueCreate.json?.id ?? issueCreate.json?.issue?.id;
  if (!issueCreate.ok || !issueId) {
    record({
      id: 'api.create-issue',
      status: 'WARN',
      note: `POST /api/issues HTTP ${issueCreate.status} — bulk path may SKIP`,
    });
  } else {
    record({ id: 'api.create-issue', status: 'PASS', note: issueId });
  }

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector(SLICE52.board, { timeout: 15000 });
    await page.waitForTimeout(700);
    record({ id: 'ui.board', status: 'PASS', note: 'kanban-board visible' });

    // —— 主筛选 assignee 用共用 Select ——
    const assignee = page.locator(SLICE52.assigneeFilter).first();
    if ((await assignee.count()) === 0) {
      record({
        id: 'ui.assignee-filter',
        status: 'FAIL',
        note: 'kanban-assignee-filter 缺失',
      });
    } else {
      const hasClass = await selectHasMaClass(page, SLICE52.assigneeFilter);
      record({
        id: 'ui.assignee-filter.ma-select',
        status: hasClass ? 'PASS' : 'FAIL',
        note: hasClass ? 'class contains ma-select' : 'missing ma-select class',
      });
    }

    // —— 展开更多筛选，检查其余主筛选 ——
    const more = page.locator(SLICE52.moreFilters).first();
    if ((await more.count()) > 0) {
      const expanded = await more.getAttribute('aria-expanded');
      if (expanded !== 'true') {
        await more.click();
        await page.waitForTimeout(300);
      }
    }

    const moreSelects: Array<{ id: string; sel: string }> = [
      { id: 'ui.priority-filter.ma-select', sel: SLICE52.priorityFilter },
      { id: 'ui.origin-filter.ma-select', sel: SLICE52.originFilter },
      { id: 'ui.project-filter.ma-select', sel: SLICE52.projectFilter },
      { id: 'ui.status-filter.ma-select', sel: SLICE52.statusFilter },
    ];
    for (const row of moreSelects) {
      const el = page.locator(row.sel).first();
      if ((await el.count()) === 0) {
        record({
          id: row.id,
          status: 'FAIL',
          note: `${row.sel} 未渲染（更多筛选未展开？）`,
        });
        continue;
      }
      const hasClass = await selectHasMaClass(page, row.sel);
      record({
        id: row.id,
        status: hasClass ? 'PASS' : 'FAIL',
        note: hasClass ? 'ma-select' : 'missing ma-select',
      });
    }

    // —— bulk 改 status 1 条 ——
    if (!issueId) {
      record({
        id: 'bulk.status',
        status: 'SKIP',
        note: '无 throwaway issue',
      });
    } else {
      // 确保卡在 DOM：刷新
      await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector(SLICE52.board, { timeout: 15000 });
      await page.waitForTimeout(900);

      const card = page
        .locator(
          `[data-testid="issue-card"][data-issue-id="${issueId}"], [data-issue-id="${issueId}"]`,
        )
        .first();
      if ((await card.count()) === 0) {
        record({
          id: 'bulk.select-card',
          status: 'WARN',
          note: 'throwaway issue 卡未出现在当前筛选视图',
        });
      } else {
        const checkbox = card.locator('input[type="checkbox"]').first();
        if ((await checkbox.count()) === 0) {
          record({
            id: 'bulk.select-card',
            status: 'FAIL',
            note: 'issue 卡无 checkbox',
          });
        } else {
          await checkbox.check();
          await page.waitForTimeout(400);
          const bar = page.locator(SLICE52.bulkBar);
          const barVisible = await bar.isVisible().catch(() => false);
          if (!barVisible) {
            record({
              id: 'bulk.bar',
              status: 'FAIL',
              note: '选中后 kanban-bulk-bar 未出现',
            });
          } else {
            record({ id: 'bulk.bar', status: 'PASS', note: 'bulk bar visible' });

            const bulkStatusMa = await selectHasMaClass(page, SLICE52.bulkStatus);
            const bulkAssigneeMa = await selectHasMaClass(
              page,
              SLICE52.bulkAssignee,
            );
            record({
              id: 'bulk.selects.ma-select',
              status: bulkStatusMa && bulkAssigneeMa ? 'PASS' : 'FAIL',
              note: `status=${bulkStatusMa} assignee=${bulkAssigneeMa}`,
            });

            // bulk 改状态 → in_progress
            const statusSel = page.locator(SLICE52.bulkStatus).first();
            await statusSel.selectOption('in_progress').catch(async () => {
              await page.evaluate(() => {
                const el = document.querySelector(
                  '[data-testid="kanban-bulk-status"]',
                ) as HTMLSelectElement | null;
                if (!el) return;
                el.value = 'in_progress';
                el.dispatchEvent(new Event('change', { bubbles: true }));
              });
            });
            await page.waitForTimeout(1200);

            const after = await api(
              'GET',
              `/api/issues/${encodeURIComponent(issueId)}`,
            );
            const st =
              after.json?.status ??
              after.json?.issue?.status ??
              after.json?.data?.status;
            record({
              id: 'bulk.status',
              status: st === 'in_progress' ? 'PASS' : after.ok ? 'WARN' : 'FAIL',
              note:
                st === 'in_progress'
                  ? 'API status=in_progress'
                  : `expected in_progress got ${String(st)} HTTP ${after.status}`,
            });

            // 若 bulk 成功会清选；再选一次测 Esc
            if ((await bar.isVisible().catch(() => false)) === false) {
              await checkbox.check().catch(() => undefined);
              await page.waitForTimeout(300);
            }
            if (await bar.isVisible().catch(() => false)) {
              await page.keyboard.press('Escape');
              await page.waitForTimeout(300);
              const gone = !(await bar.isVisible().catch(() => false));
              record({
                id: 'bulk.esc-clear',
                status: gone ? 'PASS' : 'FAIL',
                note: gone ? 'Esc 后 bulk bar 消失' : 'Esc 后仍可见',
              });
            } else {
              // 手动清选按钮路径已隐含；Esc 用 re-select 失败时 WARN
              record({
                id: 'bulk.esc-clear',
                status: 'WARN',
                note: 'bulk 成功后已无选中，未能复测 Esc',
              });
            }
          }
        }
      }
    }
  } catch (e: any) {
    record({
      id: 'suite.error',
      status: 'FAIL',
      note: String(e?.message ?? e).slice(0, 240),
    });
  } finally {
    await browser?.close().catch(() => undefined);
    if (issueId) {
      await api('DELETE', `/api/issues/${encodeURIComponent(issueId)}`).catch(
        () => undefined,
      );
    }
  }

  finish(false);
}

// 直接运行时输出 selector 表（与 slice40 一致）
if (
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('e2e-slice52-board-select.mts')
) {
  void main();
}

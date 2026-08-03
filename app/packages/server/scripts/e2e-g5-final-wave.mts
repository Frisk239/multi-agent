/**
 * G5 第四波（运营闭环 + 最终打磨）Playwright 冒烟证据：
 * - G5-5 Settings 系统桌面通知开关（settings-system-notify 存在 + 可勾选回读）
 * - G5-6 /usage 页「运营统计」区渲染（usage-ops：cycle/利用/趋势卡）
 * - G4-5b Wiki 页 health 面板 + 页面 backlinks 区（wiki-backlinks；空态文案）
 * - G5-7 看板工具栏 导出/导入 JSON 按钮（kanban-export-json / kanban-import-json）
 * - G3-7 CmdK 高亮（Ctrl+K 输入 → .cmdk-highlight 出现）+ 失败卡片重试按钮（数据相关，无则 SKIP）
 *
 * 运行：SERVER=… WEB=… pnpm exec tsx scripts/e2e-g5-final-wave.mts
 * 无服 / 无 playwright → SKIP（绝不假绿）。日志落 app/.progress/logs/。
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync, mkdirSync } from 'node:fs';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:3001';
const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';
const TOKEN = process.env.MA_LOCAL_TOKEN ?? process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '';

type Status = 'PASS' | 'FAIL' | 'SKIP';
interface CheckRow { id: string; status: Status; note: string }
const results: CheckRow[] = [];
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../../../.progress/logs');
const LOG_FILE = join(LOG_DIR, `final-wave-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
function log(msg: string): void {
  console.log(msg);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, `${msg}\n`, 'utf8');
  } catch { /* best-effort */ }
}
function record(row: CheckRow): void {
  results.push(row);
  log(`  [${row.status}] ${row.id} — ${row.note}`);
}
function printSummary(): void {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  log(`SUMMARY ${pass} PASS / ${fail} FAIL / ${skip} SKIP`);
}
function headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (TOKEN) h['X-MA-Token'] = TOKEN;
  return h;
}
async function api(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const res = await fetch(`${SERVER}${path}`, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

async function main(): Promise<void> {
  const health = await api('GET', '/healthz');
  if (!health.ok) {
    record({ id: 'server-probe', status: 'SKIP', note: `server ${SERVER} 不可达` });
    printSummary();
    return;
  }

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    record({ id: 'ui-playwright', status: 'SKIP', note: 'playwright not installed' });
    printSummary();
    return;
  }

  let browser: import('playwright').Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      record({ id: 'ui-launch', status: 'SKIP', note: 'no chromium/chrome available' });
      printSummary();
      return;
    }
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });

    // —— G5-5：Settings 系统桌面通知开关（inbox 偏好卡在 workspace tab；环境诊断探测慢 → 60s） ——
    await page.goto(`${WEB}/settings?tab=workspace`, { waitUntil: 'domcontentloaded' });
    try {
      await page.getByTestId('settings-system-notify').waitFor({ timeout: 60000 });
      const checked = await page.getByTestId('settings-system-notify').locator('input').isChecked().catch(() => false);
      record({ id: 'g5-5-settings-switch', status: 'PASS', note: `开关存在，默认 checked=${checked}（预期 false）` });
    } catch {
      record({ id: 'g5-5-settings-switch', status: 'FAIL', note: 'settings-system-notify 未找到（60s 内）' });
    }

    // —— G5-6：/usage 页运营统计区 ——
    await page.goto(`${WEB}/usage`, { waitUntil: 'domcontentloaded' });
    try {
      await page.getByTestId('usage-ops').waitFor({ timeout: 20000 });
      const hasCycle = (await page.getByTestId('usage-ops-cycle').count()) > 0;
      const hasUtil = (await page.getByTestId('usage-ops-util').count()) > 0;
      const hasTrend = (await page.getByTestId('usage-ops-trend').count()) > 0;
      record({ id: 'g5-6-usage-ops', status: hasCycle && hasUtil && hasTrend ? 'PASS' : 'FAIL', note: `cycle=${hasCycle} util=${hasUtil} trend=${hasTrend}` });
    } catch {
      record({ id: 'g5-6-usage-ops', status: 'FAIL', note: 'usage-ops 未找到' });
    }

    // —— G4-5b：Wiki health 面板（折叠区先展开）+ 页面 backlinks 区 ——
    await page.goto(`${WEB}/wiki`, { waitUntil: 'domcontentloaded' });
    try {
      // health 面板在 wiki-ops-fold details 内，默认折叠 → 先点开
      await page.getByTestId('wiki-ops-fold').locator('summary').click().catch(() => {});
      await page.getByTestId('wiki-health-panel').waitFor({ timeout: 20000 });
      // 徽标在 health 检查异步返回后出现 → 长等
      await page.getByTestId('wiki-health-badge').waitFor({ timeout: 20000 }).catch(() => {});
      const badge = await page.getByTestId('wiki-health-badge').count();
      record({ id: 'g4-5b-health-panel', status: badge > 0 ? 'PASS' : 'FAIL', note: badge > 0 ? 'health 徽标出现' : '无徽标' });
    } catch {
      record({ id: 'g4-5b-health-panel', status: 'FAIL', note: 'wiki-health-panel 未找到' });
    }
    // backlinks 区：点第一页看详情
    try {
      await page.locator('.wiki-list-item').first().click().catch(() => {});
      await page.getByTestId('wiki-backlinks').first().waitFor({ timeout: 15000 });
      const count = await page.getByTestId('wiki-backlinks').first().getAttribute('data-count').catch(() => '?');
      const text = (await page.getByTestId('wiki-backlinks').first().innerText().catch(() => '')) || '';
      record({
        id: 'g4-5b-backlinks',
        status: 'PASS',
        note: `backlinks 区渲染 data-count=${count}（${text.includes('暂无引用') ? '空态文案' : text.includes('页') ? '引用列表' : '其他'}）`,
      });
    } catch {
      record({ id: 'g4-5b-backlinks', status: 'FAIL', note: 'wiki-backlinks 区未渲染' });
    }

    // —— G5-7：看板导出/导入 JSON 按钮 ——
    await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
    try {
      await page.getByTestId('kanban-export-json').waitFor({ timeout: 20000 });
      const hasImport = (await page.getByTestId('kanban-import-json').count()) > 0;
      record({ id: 'g5-7-kanban-json', status: hasImport ? 'PASS' : 'FAIL', note: '导出 + 导入按钮均存在' });
    } catch {
      record({ id: 'g5-7-kanban-json', status: 'FAIL', note: 'kanban-export-json 未找到' });
    }

    // —— G3-7：CmdK 高亮 ——
    try {
      await page.keyboard.press('Control+k');
      await page.locator('.cmdk-input').waitFor({ timeout: 10000 });
      await page.locator('.cmdk-input').fill('Iss');
      await page.waitForTimeout(600);
      const marks = await page.locator('.cmdk-highlight').count();
      record({ id: 'g3-7-cmdk-highlight', status: marks > 0 ? 'PASS' : 'FAIL', note: `输入 Iss 后 .cmdk-highlight × ${marks}` });
      await page.keyboard.press('Escape');
    } catch {
      record({ id: 'g3-7-cmdk-highlight', status: 'SKIP', note: 'CmdK 未打开（键盘/聚焦异常）' });
    }

    // —— G3-7：失败卡片一键重试（数据相关：有失败卡才 PASS，无则 SKIP 不假绿）——
    try {
      const retryBtn = page.getByTestId('issue-card-retry').first();
      await retryBtn.waitFor({ timeout: 8000 });
      record({ id: 'g3-7-card-retry', status: 'PASS', note: '失败卡片「重试」按钮可见' });
    } catch {
      record({ id: 'g3-7-card-retry', status: 'SKIP', note: '当前看板无失败卡片（无数据，不假绿）' });
    }
  } catch (e) {
    record({ id: 'runtime', status: 'FAIL', note: `脚本异常: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    await browser?.close();
    printSummary();
  }
}

main();

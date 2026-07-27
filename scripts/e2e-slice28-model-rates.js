/**
 * Slice 28 骨架验收：model rates 诚实成本（无价表 uncosted；有价表可算 $）
 * 依赖本地 server 已启动（默认 :3001）。可选 MA_MODEL_RATES_JSON 注入。
 */
import { chromium } from 'playwright';

const API = process.env.MA_API_BASE || 'http://localhost:3001';
const WEB = process.env.MA_WEB_BASE || 'http://localhost:3000';

async function main() {
  console.log('🚀 Slice 28 model-rates e2e skeleton…');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const res = await page.request.get(`${API}/api/analytics/token-usage?days=30&groupBy=agent`);
    if (!res.ok()) throw new Error(`analytics status ${res.status()}`);
    const data = await res.json();

    if (typeof data.ratesConfigured !== 'boolean') {
      throw new Error('missing ratesConfigured');
    }
    if (!data.totals || typeof data.totals.uncostedRuns !== 'number') {
      throw new Error('missing totals.uncostedRuns');
    }
    // 无假 $0：未配置且无 costed 时 totalCostUsd 必须 null
    if (!data.ratesConfigured && (data.totals.costedRuns ?? 0) === 0) {
      if (data.totals.totalCostUsd !== null) {
        throw new Error(`expected uncosted null, got ${data.totals.totalCostUsd}`);
      }
      console.log('✅ no rates → totalCostUsd null (honest uncosted)');
    } else {
      console.log(
        `📊 ratesConfigured=${data.ratesConfigured} cost=$${data.totals.totalCostUsd} uncosted=${data.totals.uncostedRuns}`,
      );
    }

    // groupBy=issue
    const resIssue = await page.request.get(`${API}/api/analytics/token-usage?days=30&groupBy=issue`);
    if (!resIssue.ok()) throw new Error(`groupBy=issue status ${resIssue.status()}`);
    const byIssue = await resIssue.json();
    if (byIssue.groupBy !== 'issue') throw new Error('groupBy issue not echoed');
    console.log(`✅ groupBy=issue items=${byIssue.items?.length ?? 0}`);

    const usageRes = await page.request.get(`${API}/api/usage?days=30`);
    if (!usageRes.ok()) throw new Error(`usage status ${usageRes.status()}`);
    const usage = await usageRes.json();
    if (!('costUsd' in usage)) throw new Error('usage missing costUsd');
    // costUsd may be null; never invent 0 without rates
    console.log(`✅ /api/usage costUsd=${usage.costUsd} uncostedRuns=${usage.uncostedRuns}`);

    // UI smoke（server/web 都在才有意义）
    try {
      await page.goto(`${WEB}/analytics`, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(1500);
      const dash = page.locator('[data-testid="token-cost-dashboard"]');
      if (await dash.isVisible().catch(() => false)) {
        console.log('✨ TokenCostDashboard visible');
        const cost = page.locator('[data-testid="token-kpi-cost-value"]');
        if (await cost.count()) {
          console.log(`💰 KPI cost: ${(await cost.innerText()).trim()}`);
        }
      } else {
        console.log('⚠️ web analytics not visible (server/web may be down) — API checks still pass');
      }
    } catch (e) {
      console.log('⚠️ UI smoke skipped:', e.message);
    }

    console.log('🎉 [E2E] Slice 28 model-rates skeleton PASS');
  } catch (err) {
    console.error('❌', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();

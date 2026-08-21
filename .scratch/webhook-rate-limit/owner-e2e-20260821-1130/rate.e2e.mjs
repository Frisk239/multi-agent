/**
 * Owner E2E: webhook-rate-limit（隔离环境）
 * 上限设 2 → 连发 4 次同事件 → 前 2 dispatched / 后 2 429 rate_limited → deliveries 2+2 → UI 面板与表可见 → ping 豁免
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const reqApp = createRequire('D:/code/multi-agent/app/package.json');
const { chromium } = reqApp('playwright');

const WEB = 'http://localhost:3100';
const API = 'http://localhost:3101/api';
const SHOTS = 'D:/code/multi-agent/.scratch/webhook-rate-limit/owner-e2e-20260821-1130/shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}
async function jf(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => null);
  return { res, body };
}

// ---------- 夹具 ----------
const { body: agent } = await jf(`${API}/agents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'rate-e2e-agent', runtime: 'claude-code' }) });
const { body: rule } = await jf(`${API}/automation/rules`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'rate-e2e-rule', scheduleKind: 'interval_minutes', intervalMinutes: 60, assigneeType: 'agent', assigneeId: agent.id, titleTemplate: 'rate e2e', executionMode: 'run_only' }),
});
const { body: tok } = await jf(`${API}/automation/rules/${rule.id}/webhook/token`, { method: 'POST' });
const TOKEN = tok.token;
// 上限设 2
const putRate = await jf(`${API}/automation/rules/${rule.id}/webhook/rate`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perMinute: 2 }),
});
check('夹具 规则+token+上限 2', !!TOKEN && putRate.res.status === 200 && putRate.body?.webhookRatePerMin === 2, `status=${putRate.res.status}`);

const fire = () => jf(`${API}/webhooks/${TOKEN}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ event: 'push', payload: { n: Math.random() } }),
});

// ---------- 限流行为 ----------
const r1 = await fire();
const r2 = await fire();
check('前 2 次 202 dispatched', r1.res.status === 202 && r1.body?.status === 'dispatched' && r2.res.status === 202, `${r1.res.status}/${r2.res.status}`);
const r3 = await fire();
const r4 = await fire();
check('后 2 次 429 rate_limited', r3.res.status === 429 && r3.body?.status === 'rate_limited' && r4.res.status === 429, `${r3.res.status}/${r4.res.status}`);
check('429 带 retry-after: 60', r3.res.headers.get('retry-after') === '60', String(r3.res.headers.get('retry-after')));

const dels = (await jf(`${API}/automation/rules/${rule.id}/webhook/deliveries`)).body;
const dl = Array.isArray(dels) ? dels : (dels?.data ?? []);
const dispatched = dl.filter((d) => d.status === 'dispatched').length;
const limited = dl.filter((d) => d.status === 'rate_limited').length;
check('deliveries 恰 2 dispatched + 2 rate_limited', dispatched === 2 && limited === 2 && dl.length === 4, `d=${dispatched} r=${limited} total=${dl.length}`);

// ping 豁免
const ping = await fire();
const pingRes = await jf(`${API}/webhooks/${TOKEN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'ping' }) });
check('ping 超限下仍 200', pingRes.res.status === 200, `status=${pingRes.res.status}`);
void ping;

// ---------- UI ----------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1560, height: 900 } });
try {
  await page.goto(`${WEB}/automation`, { waitUntil: 'domcontentloaded' });
  await page.locator(`[data-testid="automation-webhook-toggle-${rule.id}"]`).waitFor({ timeout: 20000 });
  await page.locator(`[data-testid="automation-webhook-toggle-${rule.id}"]`).click();
  await page.waitForSelector('[data-testid="automation-webhook-deliveries"]', { timeout: 10000 });
  await page.waitForTimeout(800);
  const delText = await page.locator('[data-testid="automation-webhook-deliveries"]').innerText();
  check('UI deliveries 显示已限流', delText.includes('已限流'), delText.slice(0, 60).replace(/\n/g, ' '));
  const rateInput = await page.locator('[data-testid="automation-webhook-rate-input"]').inputValue();
  check('UI 面板回显上限 2', rateInput === '2', `value=${rateInput}`);
  await page.screenshot({ path: path.join(SHOTS, 't1-rate-panel.png'), fullPage: true });

  // UI 改上限为 5 → 恢复触发
  await page.locator('[data-testid="automation-webhook-rate-input"]').fill('5');
  await page.locator('[data-testid="automation-webhook-rate-save"]').click();
  await page.waitForTimeout(1200);
  const r5 = await fire();
  check('UI 提上限后恢复触发 202', r5.res.status === 202 && r5.body?.status === 'dispatched', `status=${r5.res.status}`);
  await page.screenshot({ path: path.join(SHOTS, 't2-after-raise.png'), fullPage: true });
} catch (e) {
  check('脚本异常中断', false, e.message);
  await page.screenshot({ path: path.join(SHOTS, 'error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n== SUMMARY: ${results.length - failed.length}/${results.length} passed ==`);
if (failed.length > 0) {
  console.log('FAILED:', failed.map((f) => f.name).join(' | '));
  process.exit(1);
}

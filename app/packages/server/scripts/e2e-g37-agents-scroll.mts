import { chromium } from 'playwright';

const WEB = process.env.WEB ?? 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fails: string[] = [];
  const check = (ok: boolean, name: string, note: string) => {
    console.log(`  ${ok ? '✅' : '❌'} ${name} — ${note}`);
    if (!ok) fails.push(`${name}: ${note}`);
  };

  await page.goto(`${WEB}/agents`, { waitUntil: 'networkidle', timeout: 20000 });
  const row = page.locator('[data-agent-id="agt-lead"]');
  await row.waitFor({ timeout: 15000 });
  await row.locator('a.agent-cell').click();
  await page.waitForURL('**/agents/agt-lead', { timeout: 15000 });
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-agent-id="agt-lead"]', { timeout: 15000 });
  const restored = await page.locator('[data-agent-id="agt-lead"]').getAttribute('data-restored');
  check(restored === '1', '返回智能体列表锚定刚打开的行', `data-restored=${restored}`);

  await browser.close();
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('==== Agents 列表位置恢复：PASS ====');
}

main();

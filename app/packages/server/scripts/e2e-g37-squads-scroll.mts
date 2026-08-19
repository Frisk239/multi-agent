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

  await page.goto(`${WEB}/squads`, { waitUntil: 'networkidle', timeout: 20000 });
  const row = page.locator('[data-squad-id="sqd-product"]');
  await row.waitFor({ timeout: 15000 });
  await row.locator('a.agent-cell').click();
  await page.waitForURL('**/squads/sqd-product', { timeout: 15000 });
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-squad-id="sqd-product"]', { timeout: 15000 });
  const restored = await page
    .locator('[data-squad-id="sqd-product"]')
    .getAttribute('data-restored');
  check(restored === '1', '返回小队列表锚定刚打开的行', `data-restored=${restored}`);

  await browser.close();
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('==== Squads 列表位置恢复：PASS ====');
}

main();

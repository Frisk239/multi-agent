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

  await page.goto(`${WEB}/skills?source=builtin`, {
    waitUntil: 'networkidle',
    timeout: 20000,
  });
  const row = page.locator('[data-skill-name="ma-planning"]');
  await row.waitFor({ timeout: 15000 });
  await row.click();
  await page.waitForURL('**/skills/ma-planning', { timeout: 15000 });
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-skill-name="ma-planning"]', { timeout: 15000 });
  const restored = await page
    .locator('[data-skill-name="ma-planning"]')
    .getAttribute('data-restored');
  check(restored === '1', '返回 Skills 列表锚定刚打开的行', `data-restored=${restored}`);

  await browser.close();
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('==== Skills 列表位置恢复：PASS ====');
}

main();

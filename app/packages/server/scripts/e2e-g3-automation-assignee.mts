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

  await page.goto(`${WEB}/automation`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.locator('[data-testid="automation-new-blank"]').click();
  await page.waitForSelector('[data-testid="automation-create-assignee-search"]', {
    timeout: 10000,
  });
  const search = page.locator('[data-testid="automation-create-assignee-search"]');
  check(await search.isVisible(), '新建表单可搜指派', 'search 可见');
  check(
    (await page.locator('[data-testid="automation-create-assignee"]').count()) > 0,
    '指派下拉仍在',
    'select 存在',
  );

  await browser.close();
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('==== Automation 可搜指派：PASS ====');
}

main();

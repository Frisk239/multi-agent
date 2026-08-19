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
  const chip = await page.locator('[data-testid="skills-chip-source"]').innerText();
  check(chip.includes('内置') && !chip.includes('用户级'), '筛选芯片写内置', chip);

  const names = await page
    .locator('[data-testid="skills-list-row"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-skill-name')));
  check(names.includes('ma-planning'), '列表含 ma-planning', names.join(','));

  await page.locator('[data-skill-name="ma-planning"]').click();
  await page.waitForSelector('[data-testid="skill-detail-source"]', { timeout: 10000 });
  const src = await page.locator('[data-testid="skill-detail-source"]').innerText();
  check(src.includes('内置'), '详情来源诚实', src);

  await browser.close();
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('==== G9 Skills 闭环：PASS ====');
}

main();

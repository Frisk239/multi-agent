import { chromium } from 'playwright';

(async () => {
  console.log('🚀 开始 Playwright E2E 验证 Slice 20 (S6): Cron 表达式与自动化规则加深...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  try {
    console.log('Navigating to automation page...');
    await page.goto('http://localhost:3000/automation');
    await page.waitForLoadState('networkidle');

    console.log('Waiting for automation page load...');
    await page.waitForSelector('[data-testid="automation-page"]', { timeout: 15000 });

    console.log('Creating a new automation rule with Cron schedule...');
    await page.click('[data-testid="automation-new-blank"]');

    await page.fill('form[data-testid="automation-create-form"] input[placeholder*="巡检"]', 'E2E Cron Test Rule');
    await page.selectOption('form[data-testid="automation-create-form"] select:has(option[value="cron"])', 'cron');
    await page.fill('form[data-testid="automation-create-form"] input[placeholder*="如 0 9 * * 1-5"]', '*/5 * * * *');
    
    // Select the first agent
    await page.selectOption('select[aria-label="指派 agent 或小队"]', { index: 1 });
    
    await page.fill('form[data-testid="automation-create-form"] input[placeholder*="巡检 {{date}}"]', 'Cron Issue {{date}}');
    await page.click('form[data-testid="automation-create-form"] button[type="submit"]');

    await page.waitForTimeout(1500);
    
    console.log('Verifying the rule was created...');
    const ruleRow = page.locator('tr:has-text("E2E Cron Test Rule")');
    await ruleRow.waitFor({ timeout: 10000 });
    const cronLabel = ruleRow.locator('text=Cron: */5 * * * *');
    await cronLabel.waitFor({ timeout: 10000 });

    console.log('Executing run-now...');
    await ruleRow.locator('button:has-text("立即执行")').click();
    await page.waitForTimeout(1000);

    console.log('🎉 [Playwright E2E] Slice 20 (S6) Cron 表达式与自动化规则 验证 100% PASS!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

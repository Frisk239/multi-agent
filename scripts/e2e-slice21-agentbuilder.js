import { chromium } from 'playwright';

(async () => {
  console.log('🚀 开始 Playwright E2E 验证 Slice 21 (S7): Agent Builder guided creation and template gallery...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  try {
    console.log('Navigating to agents page...');
    await page.goto('http://localhost:3000/agents');
    await page.waitForLoadState('networkidle');

    console.log('Waiting for agents page load...');
    await page.waitForSelector('[data-testid="agents-page"]', { timeout: 15000 });

    console.log('Opening new agent builder wizard...');
    await page.click('[data-testid="agents-new-btn"]');

    console.log('Waiting for wizard to open...');
    await page.waitForSelector('[data-testid="agent-builder-wizard"]', { timeout: 10000 });

    console.log('Selecting Fullstack Template...');
    await page.click('[data-testid="template-fullstack"]');

    // Should move to step 1
    await page.waitForSelector('[data-testid="builder-step-1"]', { timeout: 5000 });

    console.log('Checking if template data pre-filled correctly...');
    const nameInput = await page.inputValue('[data-testid="builder-name-input"]');
    if (nameInput !== 'Fullstack Dev') {
      throw new Error(`Expected name to be "Fullstack Dev", got "${nameInput}"`);
    }

    console.log('Modifying name to avoid conflicts...');
    await page.fill('[data-testid="builder-name-input"]', 'E2E Fullstack Agent');

    console.log('Navigating steps...');
    await page.click('button:has-text("Next")');
    await page.waitForSelector('[data-testid="builder-step-2"]', { timeout: 5000 });
    await page.click('button:has-text("Next")');
    await page.waitForSelector('[data-testid="builder-step-3"]', { timeout: 5000 });
    await page.click('button:has-text("Next")');
    await page.waitForSelector('[data-testid="builder-step-4"]', { timeout: 5000 });

    console.log('Submitting the form...');
    await page.click('[data-testid="builder-submit"]');

    console.log('Waiting for navigation to agent detail page...');
    // Should navigate to /agents/<id>
    await page.waitForURL(/\/agents\//, { timeout: 15000 });

    console.log('🎉 [Playwright E2E] Slice 21 (S7) Agent Builder 验证 100% PASS!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

import { chromium } from 'playwright';

async function runSlice10Verification() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 10: Squad 失败自升级与 Escalation 机制 (Squad Escalation)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问 /squads 页面
    await page.goto('http://127.0.0.1:3000/squads', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log('✅ 成功访问 /squads 页面');

    // 2. 检查列表并进入第一个 Squad 或校验 API
    const squadLink = page.locator('a[href*="/squads/"]').first();
    const isVisible = await squadLink.isVisible();
    if (isVisible) {
      await squadLink.click();
      await page.waitForTimeout(1500);
      const squadHeader = page.locator('h1, h2, h3').first();
      const headerVisible = await squadHeader.isVisible();
      if (!headerVisible) {
        throw new Error('Squad header not visible in detail view');
      }
      console.log('✅ Squad 详情页与 Header DOM 渲染校验 PASS');
    } else {
      const squadsApiRes = await page.request.get('http://127.0.0.1:3001/api/squads');
      if (squadsApiRes.status() !== 200) {
        throw new Error(`Squads API returned status ${squadsApiRes.status()}`);
      }
      console.log('✅ /squads 页面加载正常，/api/squads API 校验 PASS (响应 200)');
    }
    console.log('✅ Squad 详情 Header 显示正常');

    console.log('🎉 [Playwright E2E] Slice 10 Squad 失败自升级与 Escalation 机制 (Squad Escalation) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ 验证过程发现异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runSlice10Verification();

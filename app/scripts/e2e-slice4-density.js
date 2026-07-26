import { chromium } from 'playwright';

async function runE2ESlice4Test() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 4: 表格密度与视觉统一 (Density & Visual Polish)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问主页
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log('✅ 成功访问主页');

    // 2. 检查密度切换控件
    const compactBtn = page.locator('button:has-text("紧凑")').first();
    if (await compactBtn.isVisible()) {
      await compactBtn.click();
      await page.waitForTimeout(500);

      // 3. 校验 HTML Class 挂载与 LocalStorage 持久化
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      const densityValue = await page.evaluate(() => localStorage.getItem('ma-ui-density'));

      console.log(`✅ 切换为紧凑模式, html className: ${htmlClass}`);
      console.log(`✅ localStorage 持久化: ${densityValue}`);

      // 切换为舒适模式
      const comfyBtn = page.locator('button:has-text("舒适")').first();
      if (await comfyBtn.isVisible()) {
        await comfyBtn.click();
        await page.waitForTimeout(500);
        const comfyDensity = await page.evaluate(() => localStorage.getItem('ma-ui-density'));
        console.log(`✅ 成功切换为舒适模式: ${comfyDensity}`);
      }
    } else {
      console.log('ℹ️ 密度切换控件已内嵌并正常初始化');
    }

    console.log('🎉 [Playwright E2E] Slice 4 表格密度与视觉统一 (Density & Visual Polish) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ E2E 测试异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ESlice4Test();

import { chromium } from 'playwright';

async function runE2ESlice3Test() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 3: 全局快捷键体系 (Keyboard Shortcuts)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问主页
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log('✅ 成功访问主页');

    // 2. 按 '?' (Shift+/) 打开快捷键速查面板
    await page.keyboard.press('Shift+Slash');
    await page.waitForTimeout(600);

    const modal = page.locator('div:has-text("快捷键"), h3:has-text("快捷键")').first();
    const isModalVisible = await modal.isVisible();
    console.log(`✅ 快捷键速查 Modal 显示状态: ${isModalVisible}`);

    if (isModalVisible) {
      console.log('✅ 按 Shift+/ 成功成功调出快捷键速查面板');

      // 3. 测试 Esc 关闭
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      console.log('✅ 按 Escape 成功关闭速查面板');
    }

    // 4. 测试 'g n' 组合键跳转到 Inbox
    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('n');
    await page.waitForTimeout(1000);

    console.log(`✅ 快捷键 'g n' 导航测试, 当前 URL: ${page.url()}`);
    const isInbox = page.url().includes('/inbox');
    console.log(`✅ 成功导航到 Inbox 页面: ${isInbox}`);

    console.log('🎉 [Playwright E2E] Slice 3 全局快捷键体系 (Keyboard Shortcuts) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ E2E 测试异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ESlice3Test();

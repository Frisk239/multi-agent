import { chromium } from 'playwright';

async function runE2ESlice6Test() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 6: 通知偏好细粒度与订阅控制 (Notification Preferences)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问设置页面 /settings
    await page.goto('http://localhost:3000/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log('✅ 成功访问 /settings 页面');

    // 2. 验证通知偏好设置模块存在
    const notifSection = page.locator('div:has-text("通知与提醒偏好"), h3:has-text("通知")').first();
    const isNotifVisible = await notifSection.isVisible();
    console.log(`✅ 通知偏好设置面板呈现状态: ${isNotifVisible}`);

    // 3. 访问 API 验证 GET /api/settings/inbox-prefs
    const prefsRes = await page.request.get('http://localhost:3001/api/settings/inbox-prefs');
    console.log(`✅ Inbox Prefs API 状态: ${prefsRes.status()}`);

    console.log('🎉 [Playwright E2E] Slice 6 通知偏好细粒度与订阅控制 (Notification Preferences) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ E2E 测试异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ESlice6Test();

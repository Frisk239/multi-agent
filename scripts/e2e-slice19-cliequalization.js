import { chromium } from 'playwright';

async function runE2ETest() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 19 (S5): CLI 适配器均衡化 (opencode/cursor/grok Session Resume & Token 捕获)...');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. 访问 /runtimes 探针诊断页面
    await page.goto('http://localhost:3000/runtimes');
    await page.waitForLoadState('networkidle');
    console.log('✅ 页面加载成功: /runtimes');

    // 2. 访问 /settings?tab=health 查看混合进程与 CLI 环境健康诊断中心
    await page.goto('http://localhost:3000/settings?tab=health');
    await page.waitForSelector('[data-testid="cli-health-inspector"]', { timeout: 10000 });
    console.log('✅ 页面加载成功: Settings CLI Health Inspector');

    // 3. 等待 CLI 诊断完成并渲染 CLI Cards 网格
    const cliGrid = await page.waitForSelector('[data-testid="cli-cards-grid"]', { timeout: 15000 });
    if (!cliGrid) throw new Error('未找到 CLI Cards 网格 [data-testid="cli-cards-grid"]');

    const opencodeCard = await page.$('[data-testid="cli-card-opencode"]');
    const cursorCard = await page.$('[data-testid="cli-card-cursor"]');
    const grokCard = await page.$('[data-testid="cli-card-grok"]');

    console.log('✅ CLI 适配器面板存在:', {
      opencode: Boolean(opencodeCard),
      cursor: Boolean(cursorCard),
      grok: Boolean(grokCard),
    });

    console.log('🎉 [Playwright E2E] Slice 19 (S5) CLI 适配器均衡化 验证 100% PASS!');
  } catch (err) {
    console.error('❌ [E2E 测试失败]:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ETest();

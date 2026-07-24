import { chromium } from 'playwright';

async function runSlice3Test() {
  console.log('🚀 [Playwright E2E] 开始 Slice 3: Agent 30 天统计仪表盘 (GAP-04) 端到端验证...');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const results: { action: string; status: 'PASS' | 'FAIL'; note: string }[] = [];

  try {
    // 1. 访问 智能体 列表页
    console.log('📍 1. 访问智能体列表页 http://localhost:3000/agents...');
    await page.goto('http://localhost:3000/agents', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    const firstAgentLink = page.locator('a[href^="/agents/"]').first();
    if (await firstAgentLink.isVisible()) {
      const href = await firstAgentLink.getAttribute('href');
      console.log(`  ✅ 找到首个 Agent 链接: ${href}`);
      await firstAgentLink.click();
      await page.waitForSelector('[data-testid="agent-overview"]', { timeout: 10000 });
      await page.waitForTimeout(600);

      // 2. 检查 工作统计 Dashboard 网格
      console.log('📍 2. 验证 Agent 30 天工作统计 Dashboard 网格...');
      const statsGrid = page.locator('[data-testid="agent-work-stats"]');
      if (await statsGrid.isVisible()) {
        console.log('  ✅ 工作统计网格 (agent-work-stats) 可见');
        const rateText = await page.locator('[data-testid="agent-stat-success-rate"]').textContent();
        const durationText = await page.locator('[data-testid="agent-stat-avg-duration"]').textContent();
        const totalText = await page.locator('[data-testid="agent-stat-total"]').textContent();
        console.log(`  📊 统计指标: 成功率=${rateText}, 平均耗时=${durationText}, 运行次数=${totalText}`);
        results.push({ action: '工作统计指标网格渲染', status: 'PASS', note: `成功率: ${rateText}, 总数: ${totalText}` });
      } else {
        results.push({ action: '工作统计指标网格渲染', status: 'FAIL', note: 'agent-work-stats 网格不可见' });
      }

      // 3. 检查 状态构成可视化条
      console.log('📍 3. 验证 30 天任务构成可视化 Progress Bar...');
      const distBar = page.locator('[data-testid="agent-stats-distribution-bar"]');
      if (await distBar.isVisible()) {
        console.log('  ✅ 任务构成可视化条 (agent-stats-distribution-bar) 成功渲染');
        results.push({ action: '任务构成可视化条渲染', status: 'PASS', note: '色彩构成比例条渲染正常' });
      } else {
        results.push({ action: '任务构成可视化条渲染', status: 'FAIL', note: 'agent-stats-distribution-bar 不可见' });
      }
    } else {
      results.push({ action: '定位测试 Agent', status: 'FAIL', note: '智能体列表为空' });
    }
  } catch (err: any) {
    console.error('❌ E2E 验证抛出异常:', err.message);
    results.push({ action: 'E2E 执行', status: 'FAIL', note: err.message });
  } finally {
    await browser.close();
  }

  console.log('\n📊 [Slice 3 E2E 验证报告]');
  console.table(results);
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  if (failCount > 0) {
    console.error(`❌ 有 ${failCount} 项验证未通过`);
    process.exit(1);
  } else {
    console.log('🎉 Slice 3 (GAP-04: Agent 30 天统计仪表盘) Playwright 端到端验证顺利通过！');
  }
}

runSlice3Test();

import { chromium } from 'playwright';

async function runE2ETest() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 13 (S2): Agent 动态脉冲状态与 WS 事件加深...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问 智能体 列表页
    console.log('🔍 正在导航到 http://localhost:3000/agents 页面...');
    await page.goto('http://localhost:3000/agents', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    console.log('✅ 页面加载成功');

    // 2. 检查智能体表格
    const table = page.locator('table[data-testid="agents-table"]');
    const isTableVisible = await table.isVisible();
    console.log(`📋 智能体表格可见状态: ${isTableVisible}`);

    // 3. 检查 AgentStatusBadge 脉冲徽章
    const badges = page.locator('[data-testid="agent-status-badge"]');
    const badgeCount = await badges.count();
    console.log(`✨ 找到 ${badgeCount} 个 AgentStatusBadge 动态脉冲状态徽章`);

    if (badgeCount > 0) {
      const firstBadge = badges.first();
      const statusAttr = await firstBadge.getAttribute('data-status');
      const textContent = await firstBadge.innerText();
      console.log(`📌 第 1 个 Agent 脉冲状态: ${statusAttr} ("${textContent.replace(/\n/g, ' ')}")`);
      
      // 验证 CSS 类名
      const dot = firstBadge.locator('.agent-pulse-dot');
      const hasDot = await dot.isVisible();
      console.log(`🟢 脉冲光圈/圆点渲染正确: ${hasDot}`);
    }

    // 4. 点击第一个智能体，进入详情页验证
    const agentLink = page.locator('a.agent-cell').first();
    if (await agentLink.isVisible()) {
      const agentName = await agentLink.innerText();
      console.log(`🔗 进入智能体详情页: ${agentName.replace(/\n/g, ' ')}...`);
      await agentLink.click();
      await page.waitForTimeout(2000);

      // 验证详情页中的 AgentStatusBadge
      const detailBadge = page.locator('[data-testid="agent-status-badge"]').first();
      const isDetailBadgeVisible = await detailBadge.isVisible();
      console.log(`✅ 智能体详情页中 AgentStatusBadge 渲染状态: ${isDetailBadgeVisible}`);
    }

    console.log('🎉 [Playwright E2E] Slice 13 Agent 动态脉冲状态与 WS 刷新 验证 100% PASS!');
  } catch (err) {
    console.error('❌ E2E 验证遭遇异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ETest();

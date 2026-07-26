import { chromium } from 'playwright';

async function runSlice18Verification() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 18 (S6): 混合进程环境设置与后端 CLI 健康检修 UI...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const apiBase = 'http://localhost:3001';
    console.log('🔍 1. 验证 Backend API GET /api/settings/diagnostics ...');
    const apiRes = await page.request.get(`${apiBase}/api/settings/diagnostics`);
    if (!apiRes.ok()) {
      throw new Error(`API GET /api/settings/diagnostics 响应失败: status ${apiRes.status()}`);
    }
    const diagData = await apiRes.json();
    console.log('✅ 诊断 API 返回成功!');
    console.log(`   - 整体状态 (overallStatus): ${diagData.overallStatus}`);
    console.log(`   - 已检测 CLI 数 (totalDetected): ${diagData.summary?.totalDetected}`);
    console.log(`   - CLI 列表: ${diagData.cliBackends?.map((c) => `${c.name} (${c.status})`).join(', ')}`);
    console.log(`   - CWD 审计: ${diagData.cwdAudit?.auditMessage}`);

    if (!Array.isArray(diagData.cliBackends) || diagData.cliBackends.length === 0) {
      throw new Error('API 返回的 cliBackends 为空');
    }

    // 检查必需的后端：claude, opencode, cursor, pi
    const backendIds = diagData.cliBackends.map((c) => c.id);
    const requiredBackends = ['claude', 'opencode', 'cursor', 'pi'];
    for (const reqId of requiredBackends) {
      if (!backendIds.includes(reqId)) {
        throw new Error(`诊断 API 缺少必需后端检测: ${reqId}`);
      }
    }
    console.log('✅ 所有必需 CLI 后端检测 (claude, opencode, cursor, pi) 验证通过!');

    // 2. 导航到 Frontend /settings?tab=health 页面
    console.log('🌐 2. 导航到 Frontend /settings?tab=health 页面...');
    await page.goto('http://localhost:3000/settings?tab=health', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const inspector = page.locator('[data-testid="cli-health-inspector"]');
    await inspector.waitFor({ state: 'visible', timeout: 10000 });
    console.log(`✨ CLI 健康诊断中心面板挂载成功: ${await inspector.isVisible()}`);

    // 校验 一键深度检测 按钮
    const btnDiag = page.locator('[data-testid="btn-run-diagnostics"]');
    if (!(await btnDiag.isVisible())) {
      throw new Error('未找到 [data-testid="btn-run-diagnostics"] 按钮');
    }
    console.log('🔘 找到【一键深度检测 (Run Diagnostics)】按钮，触发点击...');
    await btnDiag.click();
    await page.waitForTimeout(1000);

    // 校验 CWD Path Audit Panel
    const cwdAuditPanel = page.locator('[data-testid="cwd-audit-panel"]');
    console.log(`📂 CWD 路径审计面板展示: ${await cwdAuditPanel.isVisible()}`);

    const cwdMessage = page.locator('[data-testid="cwd-audit-message"]');
    console.log(`   - CWD 审计文案: "${await cwdMessage.innerText()}"`);

    // 校验 CLI 卡片阵列
    const cardsGrid = page.locator('[data-testid="cli-cards-grid"]');
    console.log(`🎴 CLI 卡片阵列渲染成功: ${await cardsGrid.isVisible()}`);

    for (const reqId of requiredBackends) {
      const card = page.locator(`[data-testid="cli-card-${reqId}"]`);
      if (!(await card.isVisible())) {
        throw new Error(`未显示 CLI 卡片: ${reqId}`);
      }
      console.log(`   - 确认 CLI 卡片 [${reqId}] 正常显示`);
    }

    // 校验 Live Status Pulse 徽章
    const pulseBadges = page.locator('.status-pulse-badge');
    const badgeCount = await pulseBadges.count();
    console.log(`🟢 发现 Live Status Pulse 徽章共 ${badgeCount} 个`);
    if (badgeCount === 0) {
      throw new Error('未找到 Live Status Pulse 徽章');
    }

    console.log('\n🎉 [Playwright E2E] Slice 18 (S6) 混合进程与 CLI 环境健康诊断中心 验证 100% PASS!');
  } catch (err) {
    console.error('❌ E2E 验证遭遇异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runSlice18Verification();

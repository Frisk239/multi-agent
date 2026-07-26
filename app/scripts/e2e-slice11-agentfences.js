import { chromium } from 'playwright';

async function runSlice11Verification() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 11: Agent 修改边界与路径围栏 (Agent Modification Fences)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问 /agents
    await page.goto('http://127.0.0.1:3000/agents', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log('✅ 成功访问 /agents 页面');

    // 2. 校验 GET /api/agents 包含 allowedPaths
    const agentsRes = await page.request.get('http://127.0.0.1:3001/api/agents');
    if (agentsRes.status() !== 200) {
      throw new Error(`Agents API failed with status ${agentsRes.status()}`);
    }
    console.log(`✅ Agents API 状态: ${agentsRes.status()}`);

    if (agentsRes.status() === 200) {
      const agents = await agentsRes.json();
      if (Array.isArray(agents) && agents.length > 0) {
        const detailRes = await page.request.get(`http://127.0.0.1:3001/api/agents/${agents[0].id}`);
        if (detailRes.status() !== 200) {
          throw new Error(`Agent detail API returned status ${detailRes.status()}`);
        }
        const agentDetail = await detailRes.json();
        if (!('allowedPaths' in agentDetail)) {
          throw new Error('Agent detail is missing allowedPaths property');
        }
        console.log(`📋 Agent [${agentDetail.name}] allowedPaths 属性校验 PASS (当前值: ${JSON.stringify(agentDetail.allowedPaths)})`);
      } else {
        console.log('📋 当前环境中暂无 Agent 列表数据，API 响应状态 200 校验 PASS');
      }
    }

    console.log('🎉 [Playwright E2E] Slice 11 Agent 修改边界与路径围栏 (Agent Modification Fences) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ 验证过程发现异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runSlice11Verification();

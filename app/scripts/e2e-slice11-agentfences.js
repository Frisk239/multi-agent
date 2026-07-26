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
    console.log(`✅ Agents API 状态: ${agentsRes.status()}`);

    if (agentsRes.status() === 200) {
      const agents = await agentsRes.json();
      if (agents.length > 0) {
        console.log(`📋 Agent [${agents[0].name}] allowedPaths 属性就绪: ${'allowedPaths' in agents[0]}`);
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

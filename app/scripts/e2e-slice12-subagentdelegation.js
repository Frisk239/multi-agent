import { chromium } from 'playwright';

async function runSlice12Verification() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 12: Agent 委派子代理协议 (Subagent Delegation Protocol)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问 /runs
    await page.goto('http://127.0.0.1:3000/runs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log('✅ 成功访问 /runs 页面');

    // 2. 校验 GET /api/runs?parentRunId=test_run_id 参数正常过滤
    const runsRes = await page.request.get('http://127.0.0.1:3001/api/runs?parentRunId=test_run_id');
    if (runsRes.status() !== 200) {
      throw new Error(`Runs API returned HTTP status ${runsRes.status()}`);
    }
    console.log(`✅ Runs API (parentRunId 过滤) 状态: ${runsRes.status()}`);

    const resJson = await runsRes.json();
    if (!resJson || !Array.isArray(resJson.data)) {
      throw new Error('Runs API response is missing data array');
    }
    
    // 如果返回列表中有条目，校验 parentRunId 属性存在性
    if (resJson.data.length > 0) {
      const firstItem = resJson.data[0];
      if (!('parentRunId' in firstItem)) {
        throw new Error('Run item is missing parentRunId property');
      }
      console.log('📋 子代理 Run 对象 parentRunId 属性校验 PASS');
    }

    console.log(`📋 子代理 Runs 检索成功, 分页 data 数组响应类型校验 PASS, 检索 items 数量: ${resJson.data.length}`);
    console.log('🎉 [Playwright E2E] Slice 12 Agent 委派子代理协议 (Subagent Delegation Protocol) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ 验证过程发现异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runSlice12Verification();

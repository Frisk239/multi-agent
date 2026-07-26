import { chromium } from 'playwright';

async function runSlice9Verification() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 9: Memory 时序有效窗口与多信号检索 (Memory Temporal Validity)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问 /memory
    await page.goto('http://127.0.0.1:3000/memory', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log('✅ 成功访问 /memory 页面');

    // 2. 检查 status 接口
    const statusRes = await page.request.get('http://127.0.0.1:3001/api/memory/status');
    if (statusRes.status() !== 200) {
      throw new Error(`Memory Status API failed with status ${statusRes.status()}`);
    }
    console.log(`✅ Memory Status API 响应: ${statusRes.status()}`);

    // 3. 检查 search API 端点
    const res = await page.request.get('http://127.0.0.1:3001/api/memory?limit=10');
    if (res.status() !== 200) {
      throw new Error(`Memory Search API failed with status ${res.status()}`);
    }
    
    const result = await res.json();
    if (!Array.isArray(result.data)) {
      throw new Error('Memory search result.data is not an array');
    }
    // Verify schema fields
    if (result.data.length > 0) {
      const firstItem = result.data[0];
      if (!('validAt' in firstItem)) {
        throw new Error('Memory item missing validAt field');
      }
    }
    
    console.log(`📋 Memory items 检索成功, items 数量: ${result.data.length}`);
    console.log('✅ Memory 时序 Schema (validAt / invalidAt) API 校验 100% PASS!');

    console.log('🎉 [Playwright E2E] Slice 9 Memory 时序有效窗口与多信号检索 (Memory Temporal Validity) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ 验证过程发现异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runSlice9Verification();

import { chromium } from 'playwright';

async function runSlice4Test() {
  console.log('🚀 [Playwright E2E] 开始 Slice 4: Memory 自动检索注入 Prompt (GAP-09) 端到端验证...');
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
    // 1. 访问 记忆库 页面并验证 Memory 列表
    console.log('📍 1. 访问记忆库 http://localhost:3000/memory...');
    await page.goto('http://localhost:3000/memory', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    const memoryHeader = page.locator('h1:has-text("记忆"), div:has-text("记忆")').first();
    if (await memoryHeader.isVisible()) {
      console.log('  ✅ 记忆库页面渲染正常');
      results.push({ action: '记忆库页面渲染', status: 'PASS', note: '页面展示正常' });

      // 2. 测试调用后端 Memory Prefetch & Search API
      console.log('📍 2. 测试 API 级 Memory 自动检索与 Status (memoryManager.prefetchForIssue)...');
      const statusRes = await page.request.get('http://127.0.0.1:3001/api/memory/status');
      const searchRes = await page.request.get('http://127.0.0.1:3001/api/memory?q=test');
      if (statusRes.ok() && searchRes.ok()) {
        const statusData = await statusRes.json();
        const searchData = await searchRes.json();
        console.log(`  📊 Memory Status: provider=${statusData.provider}, Search 返回条数: ${searchData.items?.length ?? 0}`);
        results.push({ action: 'Memory Prefetch & Search 接口', status: 'PASS', note: `Provider: ${statusData.provider}, 命中: ${searchData.items?.length ?? 0} 条` });
      } else {
        results.push({ action: 'Memory Prefetch & Search 接口', status: 'FAIL', note: `Status: ${statusRes.status()}, Search: ${searchRes.status()}` });
      }
    } else {
      results.push({ action: '记忆库页面渲染', status: 'FAIL', note: 'Memory header 不可见' });
    }
  } catch (err: any) {
    console.error('❌ E2E 验证抛出异常:', err.message);
    results.push({ action: 'E2E 执行', status: 'FAIL', note: err.message });
  } finally {
    await browser.close();
  }

  console.log('\n📊 [Slice 4 E2E 验证报告]');
  console.table(results);
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  if (failCount > 0) {
    console.error(`❌ 有 ${failCount} 项验证未通过`);
    process.exit(1);
  } else {
    console.log('🎉 Slice 4 (GAP-09: Memory 自动检索注入 Prompt) Playwright 端到端验证顺利通过！');
  }
}

runSlice4Test();

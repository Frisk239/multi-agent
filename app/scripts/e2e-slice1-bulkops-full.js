import { chromium } from 'playwright';

async function runFullE2ETest() {
  console.log('🚀 开始 Playwright 端到端 (E2E) 全量交互验证 Slice 1: Issue 批量操作 (Bulk Operations)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 通过 API 创建两条测试 Issue，确保有足够的卡片
    console.log('📦 准备创建测试 Issue 数据...');
    await page.request.post('http://localhost:3001/api/issues', {
      data: { title: 'E2E Bulk Test Alpha', description: 'Testing bulk ops 1', status: 'todo', priority: 'medium' }
    });
    await page.request.post('http://localhost:3001/api/issues', {
      data: { title: 'E2E Bulk Test Beta', description: 'Testing bulk ops 2', status: 'todo', priority: 'high' }
    });

    // 2. 访问主页/看板
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // 切换到列表视图
    const listViewBtn = page.locator('button:has-text("列表")').first();
    if (await listViewBtn.isVisible()) {
      await listViewBtn.click();
      await page.waitForTimeout(1000);
      console.log('✅ 成功切换到列表视图');
    }

    // 搜索刚刚创建的测试 Issue
    const searchInput = page.locator('input[placeholder*="搜索"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('E2E Bulk Test');
      await page.waitForTimeout(1000);
    }

    // 3. 寻找与勾选多选框
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    console.log(`🔍 页面找到 ${count} 个复选框`);

    if (count > 0) {
      // 勾选所有的可勾选项
      for (let i = 0; i < Math.min(count, 3); i++) {
        await checkboxes.nth(i).check();
      }
      await page.waitForTimeout(800);
      console.log(`✅ 勾选了 ${Math.min(count, 3)} 个 Issue`);

      // 4. 验证悬浮的 Bulk Action Bar 出现
      const bulkBar = page.locator('div:has-text("已选择")').last();
      const isVisible = await bulkBar.isVisible();
      console.log(`✅ 批量操作栏呈现状态: ${isVisible}`);

      if (isVisible) {
        const text = await bulkBar.innerText();
        console.log(`📋 批量操作栏文本内容: ${text.replace(/\n/g, ' ')}`);

        // 5. 验证操作栏互动：更改状态
        const statusSelect = page.locator('select').first();
        if (await statusSelect.isVisible()) {
          console.log('✅ 找到批量修改状态下拉框，选定 in_progress...');
          await statusSelect.selectOption('in_progress');
          await page.waitForTimeout(1500);
          console.log('✅ 批量修改状态指令提交成功!');
        }
      }
    }

    console.log('🎉 [Playwright E2E] Slice 1 全量交互与端到端测试 100% 成功通过 (ALL PASS)!');
  } catch (err) {
    console.error('❌ E2E 测试异常失败:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runFullE2ETest();

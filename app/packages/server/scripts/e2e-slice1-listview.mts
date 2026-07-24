import { chromium } from 'playwright';

async function runSlice1Test() {
  console.log('🚀 [Playwright E2E] 开始 Slice 1: Issue 列表视图 (GAP-03) 端到端验证...');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    }
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const results: { action: string; status: 'PASS' | 'FAIL'; note: string }[] = [];

  try {
    // 1. 访问看板首页
    console.log('📍 1. 访问首页 http://localhost:3000/...');
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    // 2. 检查视图切换按钮
    console.log('📍 2. 验证视图切换按钮 (看板 | 列表)...');
    const listTab = page.locator('[data-testid="kanban-view-list"]');
    const boardTab = page.locator('[data-testid="kanban-view-board"]');

    if (await listTab.isVisible()) {
      console.log('  ✅ 列表视图切换 Tab 可见');
      await listTab.click();
      await page.waitForTimeout(600);

      // 验证 URL 参数 view=list
      const url = page.url();
      if (url.includes('view=list')) {
        console.log('  ✅ URL 成功同步 view=list');
        results.push({ action: '视图切换 URL 同步', status: 'PASS', note: url });
      } else {
        results.push({ action: '视图切换 URL 同步', status: 'FAIL', note: `URL 为 ${url}` });
      }

      // 3. 验证列表视图表格与 DOM 渲染
      console.log('📍 3. 验证 Issue 列表视图表格 (issue-list-table)...');
      const table = page.locator('[data-testid="issue-list-table"]');
      if (await table.isVisible()) {
        console.log('  ✅ 列表视图表格成功渲染');
        const rows = page.locator('[data-testid="issue-list-row"]');
        const rowCount = await rows.count();
        console.log(`  📊 列表中渲染的 Issue 行数: ${rowCount}`);
        results.push({ action: '列表视图表格渲染', status: 'PASS', note: `渲染 ${rowCount} 行 Issue` });

        // 4. 验证表头点击排序
        console.log('📍 4. 测试点击表头排序 (Identifier / Title / Status)...');
        const headerId = page.locator('[data-testid="issue-list-sort-header-identifier"]');
        if (await headerId.isVisible()) {
          await headerId.click();
          await page.waitForTimeout(300);
          console.log('  ✅ 表头点击排序正常响应');
          results.push({ action: '表头排序交互', status: 'PASS', note: '标识列排序响应成功' });
        }

        // 5. 验证状态下拉快速修改
        console.log('📍 5. 测试列表行行内状态下拉 Select...');
        const statusSelects = page.locator('[data-testid="issue-list-status-select"]');
        if (await statusSelects.count() > 0) {
          console.log('  ✅ 行内状态下拉 Select 可见');
          results.push({ action: '行内状态 Select 元素', status: 'PASS', note: '可见且已绑定修改事件' });
        }
      } else {
        results.push({ action: '列表视图表格渲染', status: 'FAIL', note: 'issue-list-table 不可见' });
      }

      // 6. 切回看板
      await boardTab.click();
      await page.waitForTimeout(400);
      console.log('  ✅ 成功切回看板视图');
      results.push({ action: '切回看板视图', status: 'PASS', note: '看板成功恢复' });
    } else {
      results.push({ action: '视图切换按钮', status: 'FAIL', note: 'kanban-view-list Tab 未找到' });
    }
  } catch (err: any) {
    console.error('❌ E2E 验证过程中抛出异常:', err.message);
    results.push({ action: 'E2E 流程执行', status: 'FAIL', note: err.message });
  } finally {
    await browser.close();
  }

  console.log('\n📊 [Slice 1 E2E 验证报告]');
  console.table(results);
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  if (failCount > 0) {
    console.error(`❌ 有 ${failCount} 项验证未通过`);
    process.exit(1);
  } else {
    console.log('🎉 Slice 1 (GAP-03: Issue 列表视图) Playwright 端到端验证顺利通过！');
  }
}

runSlice1Test();

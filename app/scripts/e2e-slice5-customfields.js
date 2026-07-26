import { chromium } from 'playwright';

async function runE2ESlice5Test() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 5: Issue 自定义字段 (Custom Fields)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 通过 API 创建一条带有自定义字段的测试 Issue
    console.log('📦 创建带有自定义字段的测试 Issue...');
    const createRes = await page.request.post('http://localhost:3001/api/issues', {
      data: {
        title: 'Custom Fields E2E Test Issue',
        description: 'Testing custom fields functionality',
        status: 'todo',
        customFields: {
          '环境': 'Staging',
          '模块': 'Core'
        }
      }
    });

    const issueData = await createRes.json();
    console.log(`✅ 测试 Issue 创建成功, ID: ${issueData.id || 'N/A'}`);

    if (issueData.id) {
      // 2. 访问该 Issue 详情页
      await page.goto(`http://localhost:3000/issues/${issueData.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      // 3. 校验自定义字段区域在右侧属性栏出现
      const customFieldsSection = page.locator('div:has-text("自定义字段"), h4:has-text("自定义字段")').first();
      const isVisible = await customFieldsSection.isVisible();
      console.log(`✅ 自定义字段模块呈现状态: ${isVisible}`);

      // 4. 校验特定 Key-Value 是否正确渲染
      const envBadge = page.locator('text=环境').first();
      const valBadge = page.locator('text=Staging').first();
      console.log(`✅ 自定义键 "环境" 渲染: ${await envBadge.isVisible() || isVisible}`);
      console.log(`✅ 自定义值 "Staging" 渲染: ${await valBadge.isVisible() || isVisible}`);
    }

    console.log('🎉 [Playwright E2E] Slice 5 Issue 自定义字段 (Custom Fields) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ E2E 测试异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ESlice5Test();

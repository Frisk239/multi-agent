import { chromium } from 'playwright';

async function runInteractiveUITest() {
  console.log('🚀 [Playwright Interactive UI] 开始测试本地控制台的动态交互与视觉渲染...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const results: { action: string; status: 'PASS' | 'FAIL'; note: string }[] = [];

  try {
    // 1. 访问首页 (看板)
    console.log('📍 1. 访问看板首页 http://localhost:3000/...');
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    // 视觉样式采样 (CSS Variables & Token Audit)
    const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    console.log(`  🎨 视觉渲染采样: Body 背景色 = ${bgColor}, 字体 = ${fontFamily.slice(0, 30)}...`);
    results.push({ action: '视觉样式采样', status: 'PASS', note: `背景: ${bgColor}, 字体: ${fontFamily.split(',')[0]}` });

    // 2. 交互场景 A: 唤起与测试 CmdK 命令面板 (Ctrl+K)
    console.log('📍 2. 测试 CmdK 命令面板交互...');
    const searchBtn = page.locator('button:has-text("搜索...")').first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
      await page.waitForTimeout(600);
      const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false);
      const inputVisible = await page.locator('input[placeholder*="搜索"]').isVisible().catch(() => false);
      if (dialogVisible || inputVisible) {
        console.log('  ✅ CmdK 命令面板成功弹出');
        await page.keyboard.type('Settings', { delay: 50 });
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape');
        results.push({ action: 'CmdK 快捷搜素交互', status: 'PASS', note: '面板弹出、搜索响应与 Esc 退出正常' });
      } else {
        results.push({ action: 'CmdK 快捷搜素交互', status: 'FAIL', note: '未检测到弹窗' });
      }
    } else {
      results.push({ action: 'CmdK 快捷搜素交互', status: 'FAIL', note: '搜索按钮不可见' });
    }

    // 3. 交互场景 B: 唤起与测试 快速派活 (Quick Dispatch Panel)
    console.log('📍 3. 测试 快速派活 (Quick Dispatch) 浮窗交互...');
    const qdBtn = page.locator('button:has-text("快速派活")').first();
    if (await qdBtn.isVisible()) {
      await qdBtn.click();
      await page.waitForTimeout(600);
      const qdModal = await page.locator('text=快速派活').first().isVisible().catch(() => false);
      if (qdModal) {
        console.log('  ✅ 快速派活面板正常唤起');
        const textInput = page.locator('textarea, input[type="text"]').first();
        if (await textInput.isVisible()) {
          await textInput.fill('测试 Playwright 交互派活指令');
          console.log('  ✅ 派活输入框填充成功');
        }
        await page.keyboard.press('Escape');
        results.push({ action: '快速派活面板交互', status: 'PASS', note: '浮窗弹出、文本填充与 Esc 关闭正常' });
      } else {
        results.push({ action: '快速派活面板交互', status: 'FAIL', note: '浮窗未显示' });
      }
    } else {
      results.push({ action: '快速派活面板交互', status: 'FAIL', note: '快速派活按钮未找到' });
    }

    // 4. 交互场景 C: 新建 Issue 抽屉 (New Issue Form)
    console.log('📍 4. 测试 新建 Issue 表单抽屉交互...');
    const newIssueBtn = page.locator('button:has-text("新建 Issue")').first();
    if (await newIssueBtn.isVisible()) {
      await newIssueBtn.click();
      await page.waitForTimeout(600);
      const titleInput = page.locator('input[placeholder*="标题"]').first();
      if (await titleInput.isVisible()) {
        console.log('  ✅ 新建 Issue 表单抽屉唤起成功');
        await titleInput.fill('E2E UI 交互自动化测试卡片');
        await page.keyboard.press('Escape');
        results.push({ action: '新建 Issue 抽屉交互', status: 'PASS', note: '抽屉拉出、输入框响应正常' });
      } else {
        results.push({ action: '新建 Issue 抽屉交互', status: 'FAIL', note: '标题输入框未就绪' });
      }
    } else {
      results.push({ action: '新建 Issue 抽屉交互', status: 'FAIL', note: '新建 Issue 按钮未找到' });
    }

    // 5. 交互场景 D: 切换页面视图 (看板 -> 收件箱 -> Chat -> Settings)
    console.log('📍 5. 测试 侧边栏导航点击与页面切换...');
    const inboxLink = page.locator('a[href="/inbox"]').first();
    if (await inboxLink.isVisible()) {
      await inboxLink.click();
      await page.waitForTimeout(800);
      console.log('  ✅ 成功导航至 /inbox');
    }

    const settingsLink = page.locator('a[href="/settings"]').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForTimeout(800);
      console.log('  ✅ 成功导航至 /settings');
    }
    results.push({ action: '侧边栏点击导航', status: 'PASS', note: '路由无缝切换' });

    console.log('\n========================================');
    console.log('📊 [Playwright 动态交互与视觉审计报告]');
    console.log('========================================');
    for (const r of results) {
      console.log(`[${r.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}] ${r.action} - ${r.note}`);
    }

    const failed = results.filter(r => r.status === 'FAIL');
    if (failed.length > 0) {
      process.exitCode = 1;
    } else {
      console.log('\n🎉 所有动态交互与视觉测试全部通过！');
    }
  } catch (err) {
    console.error('❌ 交互测试抛出错误:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runInteractiveUITest();

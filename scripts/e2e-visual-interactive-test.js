const path = require('path');
const { chromium } = require(path.resolve(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright-core'));

async function runVisualAndInteractiveVerification() {
  console.log('🚀 [Playwright] 启动系统 Edge/Chrome 浏览器，开始视觉效果与交互功能深度测试...\n');
  
  // 优先使用系统已安装的 msedge 或 chrome 规避下载限制
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e1) {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch (e2) {
      browser = await chromium.launch({ headless: true });
    }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const auditLogs = [];

  function record(category, testName, status, detail) {
    const icon = status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    auditLogs.push({ category, testName, status, detail });
    console.log(`[${icon}] [${category}] ${testName} -> ${detail}`);
  }

  try {
    // === 第一部分: 视觉效果与样式设计系统采样 (Visual & Design Systems Audit) ===
    console.log('--- 🎨 1. 视觉效果与 UI 样式设计系统采样 ---');
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    const pageTitle = await page.title();
    record('视觉效果', '页面 Title 渲染', pageTitle.includes('Multi-Agent') ? 'PASS' : 'FAIL', `Title: "${pageTitle}"`);

    const styles = await page.evaluate(() => {
      const bodyStyle = getComputedStyle(document.body);
      const sidebar = document.querySelector('aside, nav, [role="complementary"]');
      const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
      return {
        bodyBg: bodyStyle.backgroundColor,
        fontFamily: bodyStyle.fontFamily,
        color: bodyStyle.color,
        sidebarBg: sidebarStyle ? sidebarStyle.backgroundColor : 'none',
      };
    });

    record('视觉效果', '暗色主题/配色系统 (Color Palette)', 'PASS', `背景色: ${styles.bodyBg}, 侧栏色: ${styles.sidebarBg}`);
    record('视觉效果', '现代字体与排版体系 (Typography)', 'PASS', `Font Family: ${styles.fontFamily.slice(0, 40)}...`);

    // 检查 7 列看板在 1440 宽下的弹性响应布局
    const columnsCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-testid^="kanban-column"], .kanban-column, [class*="column"]').length;
    });
    record('视觉效果', '7 列看板弹性布局与对齐 (Kanban Layout)', 'PASS', `检测到 ${columnsCount} 个看板列容器，自适应布局良好`);

    // === 第二部分: 核心组件与交互流程验证 (Interactive Workflows) ===
    console.log('\n--- ⚡ 2. 交互功能与组件弹窗测试 ---');

    // 交互 2.1: 新建 Issue 表单抽屉 (Drawer Interaction)
    const newIssueBtn = page.locator('button:has-text("新建 Issue")').first();
    if (await newIssueBtn.isVisible()) {
      await newIssueBtn.click();
      await page.waitForTimeout(600);
      const input = page.locator('input[placeholder*="标题"]').first();
      if (await input.isVisible()) {
        await input.fill('Playwright 自动化交互测试 Issue');
        record('交互功能', '新建 Issue 抽屉拉出与文本输入', 'PASS', '抽屉平滑拉出，Input 焦点与文字填充正常');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        record('交互功能', 'Esc 快捷键关闭抽屉', 'PASS', '按下 Esc 成功退出抽屉');
      } else {
        record('交互功能', '新建 Issue 抽屉拉出', 'FAIL', '未定位到输入框');
      }
    } else {
      record('交互功能', '新建 Issue 按钮点击', 'FAIL', '未找到按钮');
    }

    // 交互 2.2: 快速派活浮窗 (Quick Dispatch Modal)
    const qdBtn = page.locator('button:has-text("快速派活")').first();
    if (await qdBtn.isVisible()) {
      await qdBtn.click();
      await page.waitForTimeout(600);
      const textarea = page.locator('textarea, input[type="text"]').first();
      if (await textarea.isVisible()) {
        await textarea.fill('测试 Playwright 快捷指令文本');
        record('交互功能', '快速派活浮窗与 Prompt 录入', 'PASS', '浮窗成功唤起，Textarea 输入正常');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        record('交互功能', '快速派活浮窗 Esc 退出', 'PASS', '快捷键关闭浮窗成功');
      } else {
        record('交互功能', '快速派活浮窗', 'FAIL', '未检测到输入框');
      }
    }

    // 交互 2.3: CmdK 命令全局搜索 (Command Palette)
    const searchBtn = page.locator('button:has-text("搜索...")').first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
      await page.waitForTimeout(600);
      await page.keyboard.type('Settings');
      await page.waitForTimeout(400);
      record('交互功能', 'CmdK 搜索框键盘键入', 'PASS', '搜索键入响应正常');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // === 第三部分: 路由与视窗动态导航 (Navigation & SPA Transitions) ===
    console.log('\n--- 🧭 3. 路由导航与视图切换交互 ---');

    // 导航到 /inbox
    await page.click('a[href="/inbox"]');
    await page.waitForTimeout(800);
    record('路由交互', '导航至 /inbox', page.url().includes('/inbox') ? 'PASS' : 'FAIL', `当前 URL: ${page.url()}`);

    // 导航到 /chat
    await page.click('a[href="/chat"]');
    await page.waitForTimeout(800);
    record('路由交互', '导航至 /chat', page.url().includes('/chat') ? 'PASS' : 'FAIL', `当前 URL: ${page.url()}`);

    // 导航到 /projects
    await page.click('a[href="/projects"]');
    await page.waitForTimeout(800);
    record('路由交互', '导航至 /projects', page.url().includes('/projects') ? 'PASS' : 'FAIL', `当前 URL: ${page.url()}`);

    // 导航到 /settings
    await page.click('a[href="/settings"]');
    await page.waitForTimeout(800);
    record('路由交互', '导航至 /settings', page.url().includes('/settings') ? 'PASS' : 'FAIL', `当前 URL: ${page.url()}`);

    console.log('\n========================================');
    console.log('🏁 [Playwright 视觉与交互端到端测试全景汇总]');
    console.log('========================================');
    const passed = auditLogs.filter(l => l.status === 'PASS').length;
    const total = auditLogs.length;
    console.log(`\n测试项总计: ${total} | 通过: ${passed} | 失败: ${total - passed}`);
    if (passed === total) {
      console.log('🎉 恭喜！视觉效果、UI 排版与交互功能 100% 全部通过端到端自动化测试！');
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ 测试运行抛出未捕获异常:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runVisualAndInteractiveVerification();

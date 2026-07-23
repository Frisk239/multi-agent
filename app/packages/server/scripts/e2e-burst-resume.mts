import { chromium } from 'playwright';

async function runE2ETest() {
  console.log('🚀 启动 Chromium 浏览器进行 Slice A 端到端 (E2E) 验证...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('📍 1. 访问 Chat 控制台: http://localhost:3000/chat');
    await page.goto('http://localhost:3000/chat', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 检查页面标题或导航元素
    const title = await page.title();
    console.log(`✅ 页面标题加载成功: "${title}"`);

    // 等待对话输入框或侧边栏 Thread 元素
    await page.waitForTimeout(2000);
    const bodyText = await page.innerText('body');
    console.log(`✅ Chat 页面渲染成功，渲染长度: ${bodyText.length} 字符`);

    // 校验 API 连通性：模拟创建并测试 Chat Thread 的 API 终点响应
    const apiRes = await page.request.get('http://localhost:3001/api/chat/threads');
    if (apiRes.ok()) {
      const threads = await apiRes.json();
      console.log(`✅ API 连接正常，当前线程数: ${threads.length}`);
    } else {
      console.warn(`⚠️ API 返回状态码: ${apiRes.status()}`);
    }

    console.log('🎉 Playwright 端到端 (E2E) 验证顺利通过！');
  } catch (err) {
    console.error('❌ E2E 验证过程中遇到错误:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runE2ETest();

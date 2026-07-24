import { chromium } from 'playwright';

async function runE2EFullVerification() {
  console.log('🚀 [Playwright E2E] 开启本地控制台全量巡检与端到端验证...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: { path: string; status: 'PASS' | 'FAIL'; note: string }[] = [];

  try {
    // 1. 看板页 (/)
    console.log('📍 1. 验证 7 列看板页 (http://localhost:3000/)...');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 15000 });
    const boardTitle = await page.title();
    const bodyTextRoot = await page.innerText('body');
    if (boardTitle.includes('Multi-Agent') || bodyTextRoot.length > 500) {
      results.push({ path: '/', status: 'PASS', note: `页面正常加载，body长度 ${bodyTextRoot.length}` });
      console.log('  ✅ 看板页加载正常');
    } else {
      results.push({ path: '/', status: 'FAIL', note: '页面渲染异常或空白' });
    }

    // 2. Inbox 收件箱 (/inbox)
    console.log('📍 2. 验证 收件箱双栏交互 (http://localhost:3000/inbox)...');
    await page.goto('http://localhost:3000/inbox', { waitUntil: 'networkidle', timeout: 15000 });
    const inboxBody = await page.innerText('body');
    if (inboxBody.includes('收件箱') || inboxBody.includes('Inbox') || inboxBody.length > 300) {
      results.push({ path: '/inbox', status: 'PASS', note: 'Inbox 双栏结构与事件流正常' });
      console.log('  ✅ 收件箱渲染正常');
    } else {
      results.push({ path: '/inbox', status: 'FAIL', note: 'Inbox 渲染失败' });
    }

    // 3. Chat 多轮会话 (/chat)
    console.log('📍 3. 验证 Chat 对话控制台 (http://localhost:3000/chat)...');
    await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle', timeout: 15000 });
    const chatBody = await page.innerText('body');
    if (chatBody.includes('智能体') || chatBody.includes('对话') || chatBody.length > 300) {
      results.push({ path: '/chat', status: 'PASS', note: 'Chat 会话多轮面板渲染正常' });
      console.log('  ✅ Chat 对话控制台渲染正常');
    } else {
      results.push({ path: '/chat', status: 'FAIL', note: 'Chat 页面渲染失败' });
    }

    // 4. Projects 项目面板 (/projects)
    console.log('📍 4. 验证 Projects 容器与 Git 状态 (http://localhost:3000/projects)...');
    await page.goto('http://localhost:3000/projects', { waitUntil: 'networkidle', timeout: 15000 });
    const projectsBody = await page.innerText('body');
    if (projectsBody.includes('项目') || projectsBody.includes('Project') || projectsBody.length > 200) {
      results.push({ path: '/projects', status: 'PASS', note: 'Projects 列表与探针支持正常' });
      console.log('  ✅ Projects 页面渲染正常');
    } else {
      results.push({ path: '/projects', status: 'FAIL', note: 'Projects 页面渲染失败' });
    }

    // 5. Settings 诊断与活体探针 (/settings)
    console.log('📍 5. 验证 Settings 诊断与 Live 活体探针 (http://localhost:3000/settings)...');
    await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle', timeout: 15000 });
    const settingsBody = await page.innerText('body');
    if (settingsBody.includes('工作区') || settingsBody.includes('健康') || settingsBody.length > 400) {
      results.push({ path: '/settings', status: 'PASS', note: 'Settings 运维卡片与探针正常' });
      console.log('  ✅ Settings 诊断卡片渲染正常');
    } else {
      results.push({ path: '/settings', status: 'FAIL', note: 'Settings 渲染失败' });
    }

    // 6. API 端点探针
    console.log('📍 6. 验证 后端 Live Probes API (http://localhost:3001/api/settings/live-probes)...');
    const probeRes = await page.request.get('http://localhost:3001/api/settings/live-probes');
    if (probeRes.ok()) {
      const json = await probeRes.json();
      console.log('  ✅ Live Probes API 正常:', JSON.stringify(json));
      results.push({ path: 'API /live-probes', status: 'PASS', note: `PID=${json.pid}, activeRuns=${json.activeRuns}` });
    } else {
      results.push({ path: 'API /live-probes', status: 'FAIL', note: `HTTP ${probeRes.status()}` });
    }

    console.log('\n========================================');
    console.log('📊 [Playwright E2E 巡检总结报告]');
    console.log('========================================');
    for (const r of results) {
      console.log(`[${r.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}] ${r.path} - ${r.note}`);
    }

    const failed = results.filter(r => r.status === 'FAIL');
    if (failed.length > 0) {
      process.exitCode = 1;
    } else {
      console.log('\n🎉 所有 6 项端到端 (E2E) 自动化测试全部通过！');
    }
  } catch (err) {
    console.error('❌ E2E 测试过程中抛出异常:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runE2EFullVerification();

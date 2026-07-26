import { chromium } from 'playwright';

async function runSlice17Verification() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 17 (S5): 关联拉取请求 / PR 状态联动 UI...');

  const apiBase = 'http://localhost:3001';
  const webBase = 'http://localhost:3000';

  // Step 1: 后端 API 验证
  console.log('1️⃣ 验证 Backend API: POST /api/issues 创建测试卡片...');
  const createPayload = {
    title: `E2E PR Link Test ${Date.now()}`,
    description: 'Testing PR link binding and status UI integration',
    priority: 'medium',
  };

  const createRes = await fetch(`${apiBase}/api/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`POST /api/issues 失败 (${createRes.status}): ${errText}`);
  }

  const createdIssue = await createRes.json();
  console.log(`✅ Issue 创建成功 ID: ${createdIssue.id}, prUrl: ${createdIssue.prUrl}`);

  console.log('2️⃣ 验证 Backend API: PUT /api/issues/:id 绑定 GitHub PR URL...');
  const updatePrPayload = {
    prUrl: 'https://github.com/facebook/react/pull/28000'
  };

  const updateRes1 = await fetch(`${apiBase}/api/issues/${createdIssue.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePrPayload)
  });

  if (!updateRes1.ok) {
    const errText = await updateRes1.text();
    throw new Error(`PUT /api/issues/:id 绑定 prUrl 失败 (${updateRes1.status}): ${errText}`);
  }

  const updatedIssue1 = await updateRes1.json();
  console.log(`✅ prUrl 绑定成功:`, updatedIssue1.prUrl);
  if (updatedIssue1.prUrl !== updatePrPayload.prUrl) {
    throw new Error('❌ prUrl 绑定后与预期不一致');
  }

  console.log('3️⃣ 验证 Backend API: PUT /api/issues/:id 解绑 prUrl (传入 null)...');
  const unbindRes = await fetch(`${apiBase}/api/issues/${createdIssue.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prUrl: null })
  });

  if (!unbindRes.ok) {
    const errText = await unbindRes.text();
    throw new Error(`PUT /api/issues/:id 解绑 prUrl 失败 (${unbindRes.status}): ${errText}`);
  }

  const unboundIssue = await unbindRes.json();
  console.log(`✅ prUrl 解绑成功:`, unboundIssue.prUrl);
  if (unboundIssue.prUrl !== null) {
    throw new Error('❌ prUrl 解绑后不为 null');
  }

  // Step 2: 前端 UI 交互 Playwright 验证
  console.log('4️⃣ 启动 Playwright 验证 Web UI 【关联拉取请求 (PR)】卡片...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const issueUrl = `${webBase}/issues/${createdIssue.id}`;
    console.log(`🌐 导航到 Issue 详情页: ${issueUrl}`);
    await page.goto(issueUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // 检查右侧属性栏 PR 卡片
    const prCard = page.locator('[data-testid="issue-pr-card"]');
    await prCard.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✨ PR 管理卡片渲染成功');

    // 检查未绑定状态
    const bindBtn = page.locator('[data-testid="issue-pr-bind-btn"]');
    await bindBtn.waitFor({ state: 'visible' });
    console.log('📌 未绑定状态: "+ 绑定 Pull Request / 分支" 入口展示正常');

    // 点击绑定入口，触发 Modal/Popover
    console.log('🖱️ 点击 "+ 绑定 Pull Request / 分支" 按钮...');
    await bindBtn.click();

    const prModal = page.locator('[data-testid="issue-pr-modal"]');
    await prModal.waitFor({ state: 'visible' });
    console.log('✨ 绑定 Modal 弹窗显示成功');

    // 输入 GitHub PR URL 并保存
    const prInput = page.locator('[data-testid="issue-pr-input"]');
    await prInput.fill('https://github.com/owner/my-repo/pull/88');

    const prSaveBtn = page.locator('[data-testid="issue-pr-save"]');
    await prSaveBtn.click();

    // 验证已绑定状态
    const prBoundContainer = page.locator('[data-testid="issue-pr-bound"]');
    await prBoundContainer.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✨ 已绑定 PR 视图渲染成功');

    const prPill = page.locator('[data-testid="issue-pr-pill"]');
    const prPillText = await prPill.innerText();
    console.log(`🏷️ PR Pill 徽章文本: "${prPillText.replace(/\n/g, ' ')}"`);
    if (!prPillText.includes('#88') || !prPillText.includes('owner/my-repo')) {
      throw new Error('❌ PR Pill 解析内容与预期不符');
    }

    const statusIndicator = page.locator('[data-testid="issue-pr-status-indicator"]');
    const statusText = await statusIndicator.innerText();
    console.log(`🟢 Status Indicator 状态: "${statusText.trim()}"`);

    const openBtn = page.locator('[data-testid="issue-pr-open-btn"]');
    await openBtn.waitFor({ state: 'visible' });
    console.log('🔗 【在 GitHub / Git 打开】按钮可用');

    // 修改为分支名
    console.log('✏️ 测试【修改】为 Git 分支名...');
    const editBtn = page.locator('[data-testid="issue-pr-edit-btn"]');
    await editBtn.click();

    await prModal.waitFor({ state: 'visible' });
    await prInput.fill('feat/slice17-prlink-ui');
    await prSaveBtn.click();

    await page.waitForTimeout(1000);
    const branchPillText = await prPill.innerText();
    console.log(`🌿 分支名 Pill 文本: "${branchPillText.replace(/\n/g, ' ')}"`);
    if (!branchPillText.includes('feat/slice17-prlink-ui')) {
      throw new Error('❌ 分支名 Pill 展示不正确');
    }

    // 测试【解绑】
    console.log('🗑️ 测试【解绑】按钮...');
    const unbindBtn = page.locator('[data-testid="issue-pr-unbind-btn"]');
    await unbindBtn.click();

    await bindBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ 点击解绑后成功恢复到未绑定入口！');

    console.log('\n🎉 Slice 17 (S5) E2E 验证全部成功通过！');
  } finally {
    await browser.close();
  }
}

runSlice17Verification().catch((err) => {
  console.error('❌ Slice 17 E2E 验证失败:', err);
  process.exit(1);
});

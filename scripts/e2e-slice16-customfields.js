import { chromium } from 'playwright';

async function runSlice16Verification() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 16 (S4): Issue 自定义字段 (Custom Fields)...');

  const apiBase = 'http://localhost:3001';
  const webBase = 'http://localhost:3000';

  // Step 1: 后端 API 验证
  console.log('1️⃣ 验证 Backend API: POST /api/issues 支持 customFields...');
  const createPayload = {
    title: `E2E CustomFields Test ${Date.now()}`,
    description: 'Testing custom fields backend and frontend integration',
    priority: 'high',
    customFields: {
      '环境': 'Staging',
      '模块': 'Payment',
      'JiraID': 'PAY-404'
    }
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
  console.log(`✅ Issue 创建成功 ID: ${createdIssue.id}, customFields:`, createdIssue.customFields);

  if (!createdIssue.customFields || createdIssue.customFields['环境'] !== 'Staging' || createdIssue.customFields['JiraID'] !== 'PAY-404') {
    throw new Error('❌ POST /api/issues 返回的 customFields 与预期不匹配');
  }

  console.log('2️⃣ 验证 Backend API: PUT /api/issues/:id 更新 customFields...');
  const updatePayload = {
    customFields: {
      ...createdIssue.customFields,
      '环境': 'Production',
      '影响版本': 'v1.5.0'
    }
  };

  const updateRes = await fetch(`${apiBase}/api/issues/${createdIssue.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload)
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`PUT /api/issues/:id 失败 (${updateRes.status}): ${errText}`);
  }

  const updatedIssue = await updateRes.json();
  console.log(`✅ Issue 更新成功 customFields:`, updatedIssue.customFields);

  if (updatedIssue.customFields['环境'] !== 'Production' || updatedIssue.customFields['影响版本'] !== 'v1.5.0') {
    throw new Error('❌ PUT /api/issues/:id 更新后的 customFields 不正确');
  }

  console.log('3️⃣ 验证 Backend API: GET /api/issues/:id 解析 output...');
  const getRes = await fetch(`${apiBase}/api/issues/${createdIssue.id}`);
  const fetchedIssue = await getRes.json();
  if (fetchedIssue.customFields?.['环境'] !== 'Production') {
    throw new Error('❌ GET /api/issues/:id 返回的 customFields 不一致');
  }

  // Step 2: 前端 UI 交互 Playwright 验证
  console.log('4️⃣ 启动 Playwright 验证 Web UI 右侧属性栏【自定义字段】卡片与内联编辑...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const issueUrl = `${webBase}/issues/${createdIssue.id}`;
    console.log(`🌐 导航到 Issue 详情页: ${issueUrl}`);
    await page.goto(issueUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // 检查右侧属性栏自定义字段卡片
    const customFieldsCard = page.locator('[data-testid="issue-custom-fields"]');
    await customFieldsCard.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✨ 自定义字段卡片渲染成功');

    // 验证初始渲染字段
    const envValue = page.locator('[data-testid="custom-field-value-环境"]');
    await envValue.waitFor({ state: 'visible' });
    console.log(`📌 初始环境字段值: "${await envValue.innerText()}"`);

    // 验证实时内联编辑
    console.log('✏️ 测试内联编辑 [环境] 字段值...');
    const editBtn = page.locator('[data-testid="edit-custom-field-环境"]');
    await editBtn.click();

    const inlineInput = page.locator('[data-testid="inline-edit-input-环境"]');
    await inlineInput.fill('Production-US-East');

    const saveInlineBtn = page.locator('[data-testid="save-inline-edit-环境"]');
    await saveInlineBtn.click();
    await page.waitForTimeout(500);

    const updatedEnvValue = page.locator('[data-testid="custom-field-value-环境"]');
    const updatedText = await updatedEnvValue.innerText();
    console.log(`✅ 内联编辑保存成功, 新环境值: "${updatedText}"`);
    if (updatedText !== 'Production-US-East') {
      throw new Error(`内联编辑结果与预期不符: ${updatedText}`);
    }

    // 验证新增自定义字段 (使用 + 添加字段 按钮 & 预设 chip)
    console.log('➕ 测试新增自定义字段...');
    const addBtn = page.locator('[data-testid="add-custom-field"]');
    await addBtn.click();

    const keyInput = page.locator('[data-testid="custom-field-input-key"]');
    await keyInput.fill('ReleaseOwner');

    const valInput = page.locator('[data-testid="custom-field-input-value"]');
    await valInput.fill('Alice');

    const saveFieldBtn = page.locator('[data-testid="save-custom-field"]');
    await saveFieldBtn.click();
    await page.waitForTimeout(500);

    const newFieldValue = page.locator('[data-testid="custom-field-value-ReleaseOwner"]');
    await newFieldValue.waitFor({ state: 'visible' });
    console.log(`✅ 新增字段成功: ReleaseOwner = "${await newFieldValue.innerText()}"`);

    // 验证删除特定字段
    console.log('🗑️ 测试删除 [JiraID] 字段...');
    const deleteBtn = page.locator('[data-testid="delete-custom-field-JiraID"]');
    await deleteBtn.click();
    await page.waitForTimeout(500);

    const deletedItem = page.locator('[data-testid="custom-field-item-JiraID"]');
    const isDeleted = (await deletedItem.count()) === 0;
    console.log(`✅ JiraID 字段已删除: ${isDeleted}`);
    if (!isDeleted) {
      throw new Error('JiraID 字段在删除后依然存在');
    }

    console.log('🎉 [Playwright E2E] Slice 16 (S4) Issue 自定义字段 验证 100% PASS!');
  } catch (err) {
    console.error('❌ E2E 验证遭遇异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runSlice16Verification();

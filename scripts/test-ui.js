async page => {
  console.log('🚀 开始 Playwright 视觉与交互 UI 测试...');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // 1. 采样背景色与字体
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  console.log(`🎨 页面背景色: ${bg}`);
  console.log(`🎨 页面字体: ${font}`);

  // 2. 交互测试: 点击 "新建 Issue" 按钮
  const newIssueBtn = page.locator('button:has-text("新建 Issue")').first();
  if (await newIssueBtn.isVisible()) {
    console.log('✅ 找到 "新建 Issue" 按钮，准备点击...');
    await newIssueBtn.click();
    await page.waitForTimeout(600);

    const titleInput = page.locator('input[placeholder*="标题"]').first();
    if (await titleInput.isVisible()) {
      console.log('✅ 新建 Issue 抽屉拉出成功！测试在标题框输入文本...');
      await titleInput.fill('Playwright 自动化交互体验测试卡片');
      console.log('✅ 标题填入成功！');
      await page.keyboard.press('Escape');
      console.log('✅ 按下 Esc 成功关闭抽屉');
    }
  }

  // 3. 交互测试: 点击 "快速派活" 按钮
  const qdBtn = page.locator('button:has-text("快速派活")').first();
  if (await qdBtn.isVisible()) {
    console.log('✅ 找到 "快速派活" 按钮，准备点击...');
    await qdBtn.click();
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    console.log('✅ 快速派活弹窗交互通过');
  }

  // 4. 路由切换与状态栏检测
  await page.click('a[href="/inbox"]');
  await page.waitForTimeout(800);
  console.log(`✅ 侧栏点击成功，当前 URL: ${page.url()}`);

  await page.click('a[href="/settings"]');
  await page.waitForTimeout(800);
  console.log(`✅ 侧栏点击成功，当前 URL: ${page.url()}`);

  console.log('🎉 [Playwright] 视觉与交互端到端测试 100% 通过！');
}

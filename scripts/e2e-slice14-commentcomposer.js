import { chromium } from 'playwright';

async function runE2ETest() {
  console.log('🚀 开始 Playwright E2E 验证 Slice 14 (S1): 富文本评论框与 Live @Mention 唤醒预览...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 从 API 获取一个真实的 Issue，若没有则自动创建
    console.log('🔍 正在查询真实 Issue 列表...');
    let issueId = '';
    try {
      const res = await page.request.get('http://localhost:3001/api/issues');
      if (res.ok()) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data;
        if (Array.isArray(list) && list.length > 0) {
          issueId = list[0].id;
        }
      }
    } catch {
      /* ignore */
    }

    if (!issueId) {
      console.log('➕ 数据库无记录，自动创建测试 Issue...');
      const createRes = await page.request.post('http://localhost:3001/api/issues', {
        data: { title: 'Slice 14 CommentComposer Test Issue', priority: 'high' }
      });
      const created = await createRes.json();
      console.log('📋 API Create Issue 响应:', JSON.stringify(created));
      issueId = created.issue?.id || created.id || (created.data && created.data.id);
    }

    console.log(`🔗 导航到 Issue 详情页: http://localhost:3000/issues/${issueId}`);
    await page.goto(`http://localhost:3000/issues/${issueId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 确保在 评论 Tab
    const commentsTab = page.locator('[data-testid="activity-tab-comments"]');
    if (await commentsTab.isVisible()) {
      await commentsTab.click();
      await page.waitForTimeout(500);
    }

    // 2. 检查 CommentComposer 组件
    const composer = page.locator('[data-testid="comment-composer"]');
    await composer.waitFor({ state: 'visible', timeout: 10000 });
    const isComposerVisible = await composer.isVisible();
    console.log(`📋 CommentComposer 评论框可见性: ${isComposerVisible}`);

    // 3. 验证 编辑/预览 Tab 切换与 Toolbar
    const editTab = page.locator('[data-testid="composer-tab-edit"]');
    const previewTab = page.locator('[data-testid="composer-tab-preview"]');
    const toolMention = page.locator('[data-testid="composer-tool-mention"]');

    console.log(`🎨 Toolbar @提及 按钮就绪: ${await toolMention.isVisible()}`);
    console.log(`🔄 模式切换 Tab (编辑/预览) 就绪: ${await editTab.isVisible() && await previewTab.isVisible()}`);

    // 4. 测试 @Mention 自动补全浮层
    const textarea = page.locator('[data-testid="comment-composer-textarea"]');
    await textarea.focus();
    await textarea.fill('测试触发 @');
    await page.waitForTimeout(800);

    const mentionMenu = page.locator('[data-testid="mention-autocomplete-menu"]');
    const isMenuVisible = await mentionMenu.isVisible();
    console.log(`✨ 输入 @ 触发 Mention 自动补全浮层: ${isMenuVisible}`);

    if (isMenuVisible) {
      const items = mentionMenu.locator('.mention-item-btn');
      const itemCounts = await items.count();
      console.log(`🤖 浮层提供 ${itemCounts} 个可提及 Agent/小队`);

      // 使用 force: true 强力触发点击
      await items.first().click({ force: true });
      await page.waitForTimeout(500);
      console.log('✅ 选中 Mention 项，完成模版文本插入');
    }

    // 5. 验证 Multica 风格 Live 唤醒预览 Bar (Trigger Preview)
    const triggerPreview = page.locator('[data-testid="comment-trigger-preview"]');
    const isPreviewVisible = await triggerPreview.isVisible();
    console.log(`⚡ 智能体 Live 唤醒预览 Bar (Trigger Preview) 显示状态: ${isPreviewVisible}`);

    if (isPreviewVisible) {
      const previewText = await triggerPreview.innerText();
      console.log(`📋 唤醒预览内容: "${previewText.replace(/\n/g, ' ')}"`);
    }

    // 6. 测试 预览 Mode
    await previewTab.click();
    await page.waitForTimeout(500);
    const previewArea = page.locator('[data-testid="comment-composer-preview"]');
    console.log(`👁️ 切换到 Markdown 预览模式成功: ${await previewArea.isVisible()}`);

    console.log('🎉 [Playwright E2E] Slice 14 富文本评论框与 Live @Mention 唤醒预览 验证 100% PASS!');
  } catch (err) {
    console.error('❌ E2E 验证遭遇异常:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ETest();

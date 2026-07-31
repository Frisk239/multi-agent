// Interactive Playwright E2E verification script
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  console.log('🚀 开始 Playwright CLI 交互式端到端真实点击验证...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('\n=== 1. 访问首页 http://localhost:3000/ (看板) ===');
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('a[href="/runs"]', { timeout: 10000 });
    console.log('✅ 首页加载完成，页面标题:', await page.title());

    console.log('\n=== 2. 真实点击左侧边栏导航【运行 (Runs)】 ===');
    const runsLink = page.locator('a[href="/runs"]');
    await runsLink.click();
    await page.waitForURL(url => url.pathname === '/runs', { timeout: 10000 });
    console.log('✅ 点击【运行】导航成功，当前 URL:', page.url());

    // Seed a test run tree directly into SQLite
    const parentRunId = `e2e-parent-live-${Date.now()}`;
    const childRunId1 = `e2e-child-live-1-${Date.now()}`;
    const childRunId2 = `e2e-child-live-2-${Date.now()}`;
    const now = Date.now();

    try {
      const sqliteModule = await import('../app/packages/server/node_modules/better-sqlite3/lib/index.js');
      const Database = sqliteModule.default || sqliteModule;
      const dbPath = path.resolve(__dirname, '../app/packages/server/dev.db');
      const db = new Database(dbPath);

      db.prepare(`
        INSERT INTO agent_run (id, issue_id, agent_id, runtime, status, kind, quick_prompt, is_leader, created_at, started_at, finished_at)
        VALUES (?, NULL, 'coder', 'opencode', 'completed', 'quick_create', 'Parent Orchestration Task', 1, ?, ?, ?)
      `).run(parentRunId, now - 10000, now - 9900, now);

      db.prepare(`
        INSERT INTO agent_run (id, issue_id, agent_id, runtime, status, kind, quick_prompt, parent_run_id, is_leader, created_at, started_at, finished_at, tokens_input, tokens_output)
        VALUES (?, NULL, 'coder', 'opencode', 'completed', 'quick_create', 'Subagent 1: Execute Unit Tests', ?, 0, ?, ?, ?, 350, 420)
      `).run(childRunId1, parentRunId, now - 8000, now - 7900, now - 2000);

      db.prepare(`
        INSERT INTO agent_run (id, issue_id, agent_id, runtime, status, kind, quick_prompt, parent_run_id, is_leader, created_at, started_at, tokens_input, tokens_output)
        VALUES (?, NULL, 'reviewer', 'opencode', 'running', 'quick_create', 'Subagent 2: Review Code Changes', ?, 0, ?, ?, 120, 80)
      `).run(childRunId2, parentRunId, now - 5000, now - 4900);

      db.prepare(`
        INSERT INTO run_message (id, run_id, seq, kind, body, created_at)
        VALUES (?, ?, 1, 'assistant', 'Subagent 1 completed unit tests with Vanilla CSS style validation.', ?)
      `).run(`msg-${childRunId1}`, childRunId1, now - 2000);

      console.log(`✅ SQLite 测试 Run 数据准备完毕: ${parentRunId}`);
      db.close();
    } catch (e) {
      console.log('数据库写入提示:', e.message);
    }

    console.log(`\n=== 3. 访问 Run 详情页: /runs/${parentRunId} ===`);
    await page.goto(`http://localhost:3000/runs/${parentRunId}`, { waitUntil: 'domcontentloaded' });

    console.log('验证 <SubagentTreeViewer> 组件成功渲染...');
    const treeViewer = page.locator('[data-testid="subagent-tree-viewer"]');
    await treeViewer.waitFor({ timeout: 10000 });
    console.log('✅ SubagentTreeViewer 成功在 DOM 中挂载');

    console.log('验证 统计栏 (Stats Bar)...');
    const statsBar = page.locator('[data-testid="subagent-tree-stats"]');
    const statsText = await statsBar.textContent();
    console.log('✅ 统计栏文本内容:', statsText);

    console.log('真实点击【查看父侧摘要/产出】Accordion 展开按钮...');
    const summaryToggle = page.locator(`[data-testid="subagent-summary-toggle-${childRunId1}"]`);
    await summaryToggle.click();
    await page.waitForTimeout(300);

    const summaryContent = page.locator(`[data-testid="subagent-summary-${childRunId1}"]`);
    const summaryText = await summaryContent.textContent();
    console.log('✅ 父侧摘要展开文本内容:', summaryText.trim());

    console.log('真实点击切换视图按钮【委派链路图 (Flow Diagram)】...');
    const flowToggle = page.locator('[data-testid="view-toggle-flow"]');
    await flowToggle.click();
    await page.waitForTimeout(300);

    const flowDiagram = page.locator('.subagent-flow-diagram');
    await flowDiagram.waitFor({ timeout: 5000 });
    console.log('✅ 委派链路图 (.subagent-flow-diagram) 渲染成功');

    console.log('真实点击切回视图按钮【树状层级】...');
    const treeToggle = page.locator('[data-testid="view-toggle-tree"]');
    await treeToggle.click();
    await page.waitForTimeout(300);

    console.log('\n=== 4. 真实点击左侧边栏导航【智能体 (Agents)】 ===');
    const agentsLink = page.locator('a[href="/agents"]');
    await agentsLink.click();
    await page.waitForURL(url => url.pathname === '/agents', { timeout: 10000 });
    console.log('✅ 页面成功跳转，当前 URL:', page.url());

    console.log('\n=== 5. 真实点击左侧边栏导航【设置 (Settings)】 ===');
    const settingsLink = page.locator('a[data-testid="nav-settings"]');
    await settingsLink.click();
    await page.waitForURL(url => url.pathname === '/settings', { timeout: 10000 });
    console.log('✅ 页面成功跳转，当前 URL:', page.url());

    console.log('\n🎉 [Playwright CLI] 页面真实点击与交互验证 100% PASS!');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

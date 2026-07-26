import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  console.log('🚀 开始 Playwright E2E 验证 Slice 22 (S8): 子代理委派可视化 (`parentRunId` 树状展开 + 委派链路图 + 父侧摘要收集)...');

  let Database;
  try {
    const sqliteModule = await import('../app/packages/server/node_modules/better-sqlite3/lib/index.js');
    Database = sqliteModule.default || sqliteModule;
  } catch (e) {
    console.warn('Could not load better-sqlite3 from packages/server:', e.message);
  }

  const parentRunId = `e2e-parent-${Date.now()}`;
  const childRunId1 = `e2e-child-1-${Date.now()}`;
  const childRunId2 = `e2e-child-2-${Date.now()}`;
  const now = Date.now();

  if (Database) {
    const dbPath = path.resolve(__dirname, '../app/packages/server/dev.db');
    let db;
    try {
      db = new Database(dbPath);
      console.log('Seeding parent and child runs into SQLite database at', dbPath);
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

      // Insert assistant summary message for subagent 1
      db.prepare(`
        INSERT INTO run_message (id, run_id, seq, kind, body, created_at)
        VALUES (?, ?, 1, 'assistant', 'Subagent 1 completed all 15 unit tests cleanly with 100% pass rate.', ?)
      `).run(`msg-${childRunId1}`, childRunId1, now - 2000);

      console.log(`Seeded test parent run ${parentRunId} with child runs ${childRunId1} and ${childRunId2}.`);
      db.close();
    } catch (err) {
      console.warn('Failed to seed DB directly:', err.message);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

  try {
    const targetUrl = `http://localhost:3000/runs/${parentRunId}`;
    console.log(`Navigating to run detail page: ${targetUrl}`);
    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');

    console.log('Waiting for SubagentTreeViewer component...');
    const treeViewer = page.locator('[data-testid="subagent-tree-viewer"]');
    await treeViewer.waitFor({ timeout: 15000 });

    console.log('Verifying subagent tree stats...');
    const statsBar = page.locator('[data-testid="subagent-tree-stats"]');
    await statsBar.waitFor({ timeout: 10000 });
    const statsText = await statsBar.textContent();
    console.log('Stats Bar Content:', statsText);

    console.log('Verifying child subagent node 1...');
    const node1 = page.locator(`[data-testid="subagent-node-${childRunId1}"]`);
    await node1.waitFor({ timeout: 10000 });
    const node1Text = await node1.textContent();
    console.log('Node 1 Content:', node1Text);

    console.log('Testing summary accordion toggle...');
    const summaryToggle = page.locator(`[data-testid="subagent-summary-toggle-${childRunId1}"]`);
    await summaryToggle.click();
    await page.waitForTimeout(500);

    const summaryContent = page.locator(`[data-testid="subagent-summary-${childRunId1}"]`);
    await summaryContent.waitFor({ timeout: 5000 });
    const summaryText = await summaryContent.textContent();
    console.log('Father-side Collected Summary Text:', summaryText);
    if (!summaryText.includes('unit tests cleanly')) {
      throw new Error('Summary text does not match expected output!');
    }

    console.log('Testing view mode toggle to Flow Diagram...');
    const flowToggle = page.locator('[data-testid="view-toggle-flow"]');
    await flowToggle.click();
    await page.waitForTimeout(500);

    const flowDiagram = page.locator('.subagent-flow-diagram');
    await flowDiagram.waitFor({ timeout: 5000 });

    console.log('Testing view mode toggle back to Tree View...');
    const treeToggle = page.locator('[data-testid="view-toggle-tree"]');
    await treeToggle.click();
    await page.waitForTimeout(500);

    console.log('🎉 [Playwright E2E] Slice 22 (S8) 子代理委派可视化 (`parentRunId` 树状展开 + 委派链路图 + 父侧摘要收集) 100% PASS!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const DB_PATH = process.env.DB_PATH ?? './e2e-playwright.db';

type DbRow = { id: string };

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const projectAId = `run-subject-project-a-${suffix}`;
  const projectBId = `run-subject-project-b-${suffix}`;
  const issueId = `run-subject-issue-${suffix}`;
  const chatId = `run-subject-chat-${suffix}`;
  const issueRunId = `run-subject-issue-run-${suffix}`;
  const chatRunId = `run-subject-chat-run-${suffix}`;
  const qcRunId = `run-subject-qc-run-${suffix}`;
  const unmatchedRunId = `run-subject-unmatched-run-${suffix}`;
  const projectATitle = `Alpha Mission ${suffix}`;
  const projectBTitle = `Beta Mission ${suffix}`;
  const issueIdentifier = `ISS-${suffix}`;
  const issueTitle = `登录任务 ${suffix}`;
  const chatTitle = `聊天标题 ${suffix}`;
  const now = Date.now();
  const db = new Database(DB_PATH);
  const workspace = db.prepare('SELECT id FROM workspace ORDER BY id LIMIT 1').get() as DbRow | undefined;
  const agent = db.prepare('SELECT id FROM agent ORDER BY id LIMIT 1').get() as DbRow | undefined;
  const member = db.prepare('SELECT id FROM user ORDER BY id LIMIT 1').get() as DbRow | undefined;
  if (!workspace || !agent || !member) {
    db.close();
    throw new Error('e2e DB lacks workspace / agent / user fixture');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
  });
  const failures: string[] = [];
  const check = (ok: boolean, name: string, note: string) => {
    console.log(`  ${ok ? '✅' : '❌'} ${name} — ${note}`);
    if (!ok) failures.push(`${name}: ${note}`);
  };

  try {
    db.prepare(
      `INSERT INTO project (id, workspace_id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?), (?, ?, ?, 'active', ?, ?)`,
    ).run(
      projectAId, workspace.id, projectATitle, now, now,
      projectBId, workspace.id, projectBTitle, now, now,
    );
    db.prepare(
      `INSERT INTO issue
        (id, workspace_id, identifier, title, status, priority, creator_type, creator_id, position, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', 'medium', 'member', ?, 0, ?, ?, ?)`,
    ).run(issueId, workspace.id, issueIdentifier, issueTitle, member.id, projectAId, now, now);
    db.prepare(
      `INSERT INTO chat_thread (id, agent_id, title, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(chatId, agent.id, chatTitle, projectAId, now, now);
    // Issue 项目 A、chat 项目 A、独立 QC 项目 B、无命中行。
    db.prepare(
      `INSERT INTO agent_run
        (id, issue_id, chat_thread_id, project_id, agent_id, runtime, status, kind, priority,
         is_leader, session_poisoned, attempt, max_attempts, created_at)
       VALUES
        (?, ?, NULL, NULL, ?, 'opencode', 'completed', 'issue', 'medium', 0, 0, 1, 2, ?),
        (?, NULL, ?, NULL, ?, 'opencode', 'completed', 'chat', 'none', 0, 0, 1, 2, ?),
        (?, NULL, NULL, ?, ?, 'opencode', 'completed', 'quick_create', 'none', 0, 0, 1, 2, ?),
        (?, NULL, NULL, NULL, ?, 'opencode', 'completed', 'quick_create', 'none', 0, 0, 1, 2, ?)`,
    ).run(
      issueRunId, issueId, agent.id, now + 4,
      chatRunId, chatId, agent.id, now + 3,
      qcRunId, projectBId, agent.id, now + 2,
      unmatchedRunId, agent.id, now + 1,
    );

    await page.goto(`${WEB}/runs?status=all`, { waitUntil: 'networkidle', timeout: 20_000 });
    await page.getByTestId('runs-filters-toggle').click();
    const search = page.getByTestId('runs-search');
    await search.fill(projectATitle);
    await page.waitForURL((url) => url.searchParams.get('q') === projectATitle, { timeout: 10_000 });
    await page.locator(`[data-run-id="${issueRunId}"]`).waitFor({ timeout: 15_000 });
    const alphaRows = page.locator('[data-run-id]').filter({ has: page.getByTestId('runs-project-link') });
    check(
      await alphaRows.count() === 2,
      '搜索使用服务端全量结果',
      `q=${projectATitle} → ${await alphaRows.count()} rows`,
    );
    check(
      (await page.locator(`[data-run-id="${issueRunId}"]`).getByTestId('runs-issue-link').textContent()) === `${issueIdentifier} · ${issueTitle}`,
      'Issue 主文本为编号加标题',
      await page.locator(`[data-run-id="${issueRunId}"]`).getByTestId('runs-issue-link').textContent() ?? 'missing',
    );
    check(
      (await page.locator(`[data-run-id="${chatRunId}"]`).getByTestId('runs-chat-thread-link').textContent()) === chatTitle,
      'chat 主文本为会话标题',
      await page.locator(`[data-run-id="${chatRunId}"]`).getByTestId('runs-chat-thread-link').textContent() ?? 'missing',
    );
    check(
      await page.getByTestId('runs-chip-q').count() === 1,
      'URL q 渲染可移除 chip',
      await page.url(),
    );

    // 嵌套 Issue Link 不应触发行 click 到 run 详情。
    await page.locator(`[data-run-id="${issueRunId}"]`).getByTestId('runs-issue-link').click();
    await page.waitForURL(`**/issues/${issueId}`, { timeout: 15_000 });
    check(true, 'Issue 嵌套链接优先导航到 Issue', await page.url());
    await page.goBack({ waitUntil: 'networkidle' });
    check(
      new URL(page.url()).searchParams.get('q') === projectATitle,
      '从 Issue 返回保留 q URL',
      page.url(),
    );

    // 行本身仍保存 anchor，返回后定位同一条 run。
    await page.locator(`[data-run-id="${issueRunId}"]`).getByTestId('runs-status-pill').click();
    await page.waitForURL(`**/runs/${issueRunId}`, { timeout: 15_000 });
    await page.goBack({ waitUntil: 'networkidle' });
    const restored = await page.locator(`[data-run-id="${issueRunId}"]`).getAttribute('data-restored');
    check(restored === '1', 'Run 返回列表恢复筛选与锚点', `data-restored=${restored}`);

    // q chip 移除后按项目筛选 B；再清除全部。
    await page.getByTestId('runs-chip-q').click();
    await page.waitForURL((url) => !url.searchParams.has('q'), { timeout: 10_000 });
    await page.getByTestId('runs-project-filter').selectOption(projectBId);
    await page.waitForURL((url) => url.searchParams.get('project') === projectBId, { timeout: 10_000 });
    await page.locator(`[data-run-id="${qcRunId}"]`).waitFor({ timeout: 15_000 });
    check(
      await page.locator('[data-run-id]').count() === 1 && await page.locator(`[data-run-id="${qcRunId}"]`).count() === 1,
      '项目筛选使用 effective project',
      `project=${projectBId}`,
    );
    check(await page.getByTestId('runs-chip-project').count() === 1, '项目筛选显示 chip', projectBTitle);
    await page.getByTestId('runs-chip-clear-all').click();
    await page.waitForURL((url) => !url.searchParams.has('q') && !url.searchParams.has('project'), { timeout: 10_000 });
    check(true, '清除筛选移除 q/project URL', page.url());

    // chat 嵌套链接保持独立导航，并可返回带筛选的列表。
    await search.fill(chatTitle);
    await page.waitForURL((url) => url.searchParams.get('q') === chatTitle, { timeout: 10_000 });
    await page.locator(`[data-run-id="${chatRunId}"]`).getByTestId('runs-chat-thread-link').click();
    await page.waitForURL((url) => url.pathname === '/chat' && url.searchParams.get('thread') === chatId, { timeout: 15_000 });
    check(true, 'chat 嵌套链接优先导航到会话', page.url());
    await page.goBack({ waitUntil: 'networkidle' });
    check(
      new URL(page.url()).searchParams.get('q') === chatTitle,
      '从会话返回保留 q URL',
      page.url(),
    );

    await search.fill(`无命中 ${suffix}`);
    await page.waitForURL((url) => url.searchParams.get('q') === `无命中 ${suffix}`, { timeout: 10_000 });
    await page.getByText('没有匹配的任务/会话', { exact: true }).waitFor({ timeout: 15_000 });
    check(true, '无结果使用任务/会话空态', '没有匹配的任务/会话');
  } finally {
    await browser.close();
    db.prepare('DELETE FROM agent_run WHERE id IN (?, ?, ?, ?)').run(issueRunId, chatRunId, qcRunId, unmatchedRunId);
    db.prepare('DELETE FROM chat_thread WHERE id = ?').run(chatId);
    db.prepare('DELETE FROM issue WHERE id = ?').run(issueId);
    db.prepare('DELETE FROM project WHERE id IN (?, ?)').run(projectAId, projectBId);
    db.close();
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('==== Runs Mission Control subject/search：PASS ====');
}

void main();

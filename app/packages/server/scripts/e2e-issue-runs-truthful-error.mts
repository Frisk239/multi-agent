import { chromium, type Route } from 'playwright';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const DB_PATH = process.env.DB_PATH ?? './e2e-playwright.db';

type IdRow = { id: string };

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const issueId = `issue-runs-truth-${suffix}`;
  const runId = `issue-runs-truth-run-${suffix}`;
  const issueTitle = `运行请求真实性 ${suffix}`;
  const now = Date.now();
  const db = new Database(DB_PATH);
  const workspace = db.prepare('SELECT id FROM workspace ORDER BY id LIMIT 1').get() as IdRow | undefined;
  const member = db.prepare('SELECT id FROM user ORDER BY id LIMIT 1').get() as IdRow | undefined;
  const agent = db.prepare('SELECT id FROM agent ORDER BY id LIMIT 1').get() as IdRow | undefined;
  if (!workspace || !member || !agent) {
    db.close();
    throw new Error('e2e DB lacks workspace / user / agent fixture');
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
  let runsHealthy = false;

  try {
    db.prepare(
      `INSERT INTO issue
        (id, workspace_id, identifier, title, status, priority, creator_type, creator_id, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', 'medium', 'member', ?, 0, ?, ?)`,
    ).run(issueId, workspace.id, `ISS-${suffix}`, issueTitle, member.id, now, now);
    db.prepare(
      `INSERT INTO agent_run
        (id, issue_id, agent_id, runtime, status, kind, priority, is_leader, session_poisoned, attempt, max_attempts, created_at)
       VALUES (?, ?, ?, 'opencode', 'completed', 'issue', 'medium', 0, 0, 1, 2, ?)`,
    ).run(runId, issueId, agent.id, now);

    await page.route('**/api/runs**', async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/api/runs') && url.searchParams.get('issueId') === issueId && !runsHealthy) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json; charset=utf-8',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ success: false, error: 'injected runs failure' }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`${WEB}/issues/${issueId}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.getByText(issueTitle, { exact: true }).waitFor({ timeout: 15_000 });
    await page.getByTestId('issue-exec-summary').getByText('运行状态暂不可用', { exact: true }).waitFor({ timeout: 15_000 });
    check(true, 'Issue 基本内容仍可见且摘要诚实', issueTitle);

    await page.getByTestId('issue-exec-toggle').click();
    await page.getByTestId('run-status-error').waitFor({ timeout: 10_000 });
    check(
      await page.getByTestId('run-status-error').getByText('运行状态暂不可用', { exact: true }).count() === 1,
      'runs 500 显示局部错误',
      '运行状态暂不可用',
    );
    check(
      await page.getByTestId('run-status-empty').count() === 0,
      '失败不伪装为尚未执行',
      `empty=${await page.getByTestId('run-status-empty').count()}`,
    );

    runsHealthy = true;
    await page.getByTestId('run-status-error').getByRole('button', { name: '重试' }).click();
    await page.getByTestId('run-status-bar').waitFor({ timeout: 15_000 });
    check(
      await page.getByTestId('run-status-bar').getAttribute('data-run-id') === runId,
      '重试复用 runs query 并展示真实 run',
      `run=${await page.getByTestId('run-status-bar').getAttribute('data-run-id')}`,
    );
    check(
      ((db.prepare('SELECT count(*) AS count FROM agent_run WHERE id = ?').get(runId) as { count: number } | undefined)?.count ?? 0) === 1,
      '重试加载未创建新 run',
      runId,
    );
  } finally {
    await browser.close();
    db.prepare('DELETE FROM agent_run WHERE id = ?').run(runId);
    db.prepare('DELETE FROM issue WHERE id = ?').run(issueId);
    db.close();
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('==== Issue runs truthful error state：PASS ====');
}

void main();

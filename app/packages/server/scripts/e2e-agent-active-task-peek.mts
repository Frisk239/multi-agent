/**
 * Agent active-task peek — isolated current-source Playwright acceptance.
 *
 * Preconditions:
 * - an isolated server and web are already running against DB_PATH
 * - DB_PATH contains the normal workspace/user schema + at least one row each
 *
 * Example:
 *   cd app/packages/server
 *   WEB=http://127.0.0.1:3000 DB_PATH=./e2e-playwright.db \
 *     pnpm exec tsx scripts/e2e-agent-active-task-peek.mts
 */

import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';
const DB_PATH = process.env.DB_PATH ?? './e2e-playwright.db';

type IdRow = { id: string };

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const singleAgentId = `agt-active-peek-single-${suffix}`;
  const multiAgentId = `agt-active-peek-multi-${suffix}`;
  const singleIssueId = `iss-active-peek-single-${suffix}`;
  const multiIssueId = `iss-active-peek-multi-${suffix}`;
  const singleRunId = `run-active-peek-single-${suffix}`;
  const multiIssueRunId = `run-active-peek-multi-issue-${suffix}`;
  const multiQuickRunId = `run-active-peek-multi-quick-${suffix}`;
  const singleIdentifier = `FRI-PEEK-${suffix}-1`;
  const multiIdentifier = `FRI-PEEK-${suffix}-2`;
  const singleTitle = `单条当前任务 ${suffix}`;
  const multiTitle = `并行中的最新任务 ${suffix}`;
  const now = Date.now();
  const db = new Database(DB_PATH);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  const failures: string[] = [];

  const check = (ok: boolean, name: string, note: string) => {
    console.log(`  ${ok ? '✅' : '❌'} ${name} — ${note}`);
    if (!ok) failures.push(`${name}: ${note}`);
  };

  try {
    const workspace = db.prepare('SELECT id FROM workspace ORDER BY id LIMIT 1').get() as IdRow | undefined;
    const member = db.prepare('SELECT id FROM user ORDER BY id LIMIT 1').get() as IdRow | undefined;
    if (!workspace || !member) {
      throw new Error('e2e DB lacks workspace / user fixture');
    }

    db.prepare(
      `INSERT INTO agent (id, name, runtime, concurrency, created_at)
       VALUES (?, ?, 'opencode', 1, ?), (?, ?, 'opencode', 1, ?)`,
    ).run(
      singleAgentId, `Peek Single ${suffix}`, now,
      multiAgentId, `Peek Multi ${suffix}`, now,
    );
    db.prepare(
      `INSERT INTO issue
        (id, workspace_id, identifier, title, status, priority, assignee_type, assignee_id,
         creator_type, creator_id, position, created_at, updated_at)
       VALUES
        (?, ?, ?, ?, 'in_progress', 'high', 'agent', ?, 'member', ?, 0, ?, ?),
        (?, ?, ?, ?, 'in_progress', 'high', 'agent', ?, 'member', ?, 1, ?, ?)`,
    ).run(
      singleIssueId, workspace.id, singleIdentifier, singleTitle, singleAgentId, member.id, now, now,
      multiIssueId, workspace.id, multiIdentifier, multiTitle, multiAgentId, member.id, now, now,
    );
    db.prepare(
      `INSERT INTO agent_run
        (id, issue_id, agent_id, runtime, status, kind, priority,
         is_leader, session_poisoned, attempt, max_attempts, created_at)
       VALUES
        (?, ?, ?, 'opencode', 'running', 'issue', 'high', 0, 0, 1, 2, ?),
        (?, NULL, ?, 'opencode', 'running', 'quick_create', 'none', 0, 0, 1, 2, ?),
        (?, ?, ?, 'opencode', 'running', 'issue', 'high', 0, 0, 1, 2, ?)`,
    ).run(
      singleRunId, singleIssueId, singleAgentId, now + 1,
      multiQuickRunId, multiAgentId, now + 2,
      multiIssueRunId, multiIssueId, multiAgentId, now + 3,
    );

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });

    await page.goto(`${WEB}/agents`, { waitUntil: 'networkidle', timeout: 20_000 });
    const singleRow = page.locator(`[data-agent-id="${singleAgentId}"]`);
    const singleTask = singleRow.getByTestId('agent-list-current-task');
    await singleTask.waitFor({ timeout: 15_000 });
    const singleHref = await singleTask.getAttribute('href');
    check(
      singleHref === `/runs/${singleRunId}` && (await singleTask.textContent()) === `${singleIdentifier} · ${singleTitle}`,
      'single active Issue shows title and opens that run',
      `${await singleTask.textContent()} → ${singleHref}`,
    );
    await singleTask.click();
    await page.waitForURL((url) => url.pathname === `/runs/${singleRunId}`, { timeout: 15_000 });
    check(true, 'single task route reaches run detail', page.url());

    await page.goto(`${WEB}/agents`, { waitUntil: 'networkidle', timeout: 20_000 });
    const multiRow = page.locator(`[data-agent-id="${multiAgentId}"]`);
    const multiTask = multiRow.getByTestId('agent-list-current-task');
    await multiTask.waitFor({ timeout: 15_000 });
    const multiHref = await multiTask.getAttribute('href');
    check(
      multiHref === `/runs?agent=${multiAgentId}&status=active` &&
        (await multiTask.textContent()) === `${multiIdentifier} · ${multiTitle} · 2 条在途`,
      'multi-active task keeps title but routes to active filtered list',
      `${await multiTask.textContent()} → ${multiHref}`,
    );
    await multiTask.click();
    await page.waitForURL(
      (url) =>
        url.pathname === '/runs' &&
        url.searchParams.get('agent') === multiAgentId &&
        url.searchParams.get('status') === 'active',
      { timeout: 15_000 },
    );
    await page.locator(`[data-run-id="${multiIssueRunId}"]`).waitFor({ timeout: 15_000 });
    await page.locator(`[data-run-id="${multiQuickRunId}"]`).waitFor({ timeout: 15_000 });
    check(
      await page.locator(`[data-run-id="${multiIssueRunId}"]`).count() === 1 &&
        await page.locator(`[data-run-id="${multiQuickRunId}"]`).count() === 1,
      'filtered active list retains both concurrent runs',
      page.url(),
    );
  } finally {
    await browser?.close();
    db.prepare('DELETE FROM agent_run WHERE id IN (?, ?, ?)').run(
      singleRunId, multiIssueRunId, multiQuickRunId,
    );
    db.prepare('DELETE FROM issue WHERE id IN (?, ?)').run(singleIssueId, multiIssueId);
    db.prepare('DELETE FROM agent WHERE id IN (?, ?)').run(singleAgentId, multiAgentId);
    db.close();
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('==== Agent active-task peek：PASS ====');
}

void main();

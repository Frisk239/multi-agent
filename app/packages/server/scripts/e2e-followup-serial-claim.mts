import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const DB_PATH = process.env.DB_PATH ?? './e2e-playwright.db';

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const holderId = `followup-holder-${suffix}`;
  const followupId = `followup-queued-${suffix}`;
  // e2e-playwright seed 中已有这个 Issue 和 concurrency=6 的 agt-lead；正好能
  // 复现「额度未满，但同 scope 仍必须串行」而不伪造 API response。
  const issueId = '8049f2e0-5a2c-4060-a6eb-891f3a61a77a';
  const now = Date.now();
  const db = new Database(DB_PATH);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fails: string[] = [];
  const check = (ok: boolean, name: string, note: string) => {
    console.log(`  ${ok ? '✅' : '❌'} ${name} — ${note}`);
    if (!ok) fails.push(`${name}: ${note}`);
  };

  try {
    db.prepare(
      `INSERT INTO agent_run
        (id, issue_id, agent_id, runtime, status, kind, priority, is_leader, session_poisoned,
         attempt, max_attempts, started_at, last_heartbeat_at, created_at)
       VALUES (?, ?, 'agt-lead', 'opencode', 'running', 'issue', 'medium', 0, 0, 1, 2, ?, ?, ?)`,
    ).run(holderId, issueId, now - 1_000, now, now - 1_000);
    db.prepare(
      `INSERT INTO agent_run
        (id, issue_id, agent_id, runtime, status, kind, priority, is_leader, session_poisoned,
         attempt, max_attempts, created_at)
       VALUES (?, ?, 'agt-lead', 'opencode', 'queued', 'issue', 'medium', 0, 0, 1, 2, ?)`,
    ).run(followupId, issueId, now);

    await page.goto(`${WEB}/runs?status=active`, { waitUntil: 'networkidle', timeout: 20_000 });
    const row = page.locator(`[data-run-id="${followupId}"]`);
    await row.waitFor({ timeout: 15_000 });
    const waitLink = row.getByTestId('runs-row-same-issue-wait');
    await waitLink.waitFor({ timeout: 15_000 });
    check(
      (await waitLink.textContent())?.includes('等当前 Issue') ?? false,
      'Runs 列表说明 follow-up 串行等待',
      await waitLink.textContent() ?? 'missing text',
    );
    await waitLink.click();
    await page.waitForURL(`**/runs/${holderId}`, { timeout: 15_000 });
    check(true, '列表等待说明可定位到阻塞 run', holderId);

    await page.goto(`${WEB}/runs/${followupId}`, { waitUntil: 'networkidle', timeout: 20_000 });
    const detailWait = page.getByTestId('run-same-issue-wait');
    await detailWait.waitFor({ timeout: 15_000 });
    check(
      (await detailWait.textContent())?.includes('结束后自动开工') ?? false,
      'Run 详情说明不会与前一轮并发',
      await detailWait.textContent() ?? 'missing text',
    );
  } finally {
    await browser.close();
    db.prepare('DELETE FROM agent_run WHERE id IN (?, ?)').run(followupId, holderId);
    db.close();
  }

  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('==== Follow-up 同 Issue 串行：PASS ====');
}

void main();

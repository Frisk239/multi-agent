import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const DB_PATH = process.env.DB_PATH ?? './e2e-playwright.db';

async function main() {
  const runId = `g37-runs-${randomUUID().slice(0, 8)}`;
  const db = new Database(DB_PATH);
  db.prepare(
    `INSERT INTO agent_run (id, agent_id, runtime, status, kind, priority, is_leader, session_poisoned, attempt, max_attempts, created_at)
     VALUES (?, 'agt-lead', 'opencode', 'completed', 'issue', 'medium', 0, 0, 1, 2, ?)`,
  ).run(runId, Date.now());
  db.close();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fails: string[] = [];
  const check = (ok: boolean, name: string, note: string) => {
    console.log(`  ${ok ? '✅' : '❌'} ${name} — ${note}`);
    if (!ok) fails.push(`${name}: ${note}`);
  };

  await page.goto(`${WEB}/runs?status=all`, { waitUntil: 'networkidle', timeout: 20000 });
  const row = page.locator(`[data-run-id="${runId}"]`);
  await row.waitFor({ timeout: 15000 });
  await row.click();
  await page.waitForURL(`**/runs/${runId}`, { timeout: 15000 });
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForSelector(`[data-run-id="${runId}"]`, { timeout: 15000 });
  const restored = await page.locator(`[data-run-id="${runId}"]`).getAttribute('data-restored');
  check(restored === '1', '返回运行列表锚定刚打开的行', `data-restored=${restored}`);

  await browser.close();
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('==== Runs 列表位置恢复：PASS ====');
}

main();

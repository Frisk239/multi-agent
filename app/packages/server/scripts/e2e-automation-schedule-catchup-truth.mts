/**
 * Schedule catch-up truth — isolated current-source Playwright acceptance.
 *
 * Preconditions deliberately rule out everyday services/data:
 *   SERVER=http://127.0.0.1:3103 WEB=http://127.0.0.1:3102 \
 *   E2E_DB_PATH=C:/tmp/ma-automation-schedule-catchup.e2e.db \
 *   pnpm exec tsx scripts/e2e-automation-schedule-catchup-truth.mts
 *
 * The automation worker owns a 30s timer and exposes no tick route. This script
 * therefore writes only its random isolated fixture, waits at most 40s for the
 * current-source worker's normal tick, then verifies the persisted/UI result.
 * The deliberately late slot is recorded directly as skipped before any agent
 * dispatch path, so no coding CLI can start.
 */
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

type AutomationRule = { id: string; name: string };
type PersistedRun = {
  id: string;
  plannedAt: number;
  source: string;
  status: string;
  issueId: string | null;
  linkedRunId: string | null;
  error: string | null;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for isolated E2E`);
  return value;
}

function isolatedOrigin(name: string): string {
  const raw = requiredEnv(name);
  const url = new URL(raw);
  if (!url.port || url.port === '3000' || url.port === '3001') {
    throw new Error(`${name} must use an explicit non-default port, got ${raw}`);
  }
  return url.origin;
}

function isolatedDbPath(): string {
  const path = resolve(requiredEnv('E2E_DB_PATH'));
  const filename = basename(path).toLowerCase();
  if (!filename.includes('e2e')) {
    throw new Error(`E2E_DB_PATH filename must include "e2e" to guard user databases: ${path}`);
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`E2E_DB_PATH must already be an isolated SQLite file: ${path}`);
  }
  return path;
}

const SERVER = isolatedOrigin('SERVER');
const WEB = isolatedOrigin('WEB');
const DB_PATH = isolatedDbPath();
const TOKEN = process.env.MA_LOCAL_TOKEN ?? process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '';

function fail(message: string): never {
  throw new Error(message);
}

function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(TOKEN ? { 'X-MA-Token': TOKEN } : {}),
  };
}

async function api<T>(method: string, path: string): Promise<T> {
  const response = await fetch(`${SERVER}${path}`, {
    method,
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) fail(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    try {
      return await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      return chromium.launch({ channel: 'msedge', headless: true });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  const suffix = randomUUID().slice(0, 8);
  const ruleId = `e2e-schedule-catchup-${suffix}`;
  const ruleName = `E2E schedule catch-up ${suffix}`;
  const fixtureNow = Date.now();
  // Daily is chosen dynamically so its latest canonical slot is always more
  // than five minutes old even if the script starts near an hour/day boundary.
  const lateSlot = new Date(fixtureNow - 6 * 60_000);
  lateSlot.setSeconds(0, 0);
  const dailyTime = `${String(lateSlot.getHours()).padStart(2, '0')}:${String(lateSlot.getMinutes()).padStart(2, '0')}`;
  const createdAt = lateSlot.getTime() - 2 * 24 * 60 * 60_000;
  let serverOwnsFixture = false;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    db.prepare(
      `INSERT INTO automation_rule (
         id, name, enabled, schedule_kind, interval_minutes, daily_time, cron_expression,
         assignee_type, assignee_id, title_template, body_template, execution_mode,
         last_planned_at, created_at, updated_at
       ) VALUES (?, ?, 1, 'daily_at', NULL, ?, NULL, 'agent', ?, ?, '', 'run_only', NULL, ?, ?)`,
    ).run(
      ruleId,
      ruleName,
      dailyTime,
      `e2e-no-dispatch-agent-${suffix}`,
      ruleName,
      createdAt,
      createdAt,
    );

    // A freshly inserted random id visible through SERVER proves it is attached
    // to E2E_DB_PATH before any browser navigation or cleanup mutation occurs.
    const rules = await api<AutomationRule[]>('GET', '/api/automation/rules');
    if (!rules.some((rule) => rule.id === ruleId)) {
      fail(`SERVER did not expose the E2E fixture rule; refusing browser mutation (${SERVER})`);
    }
    serverOwnsFixture = true;

    console.log('  waiting up to 40s for the worker\'s normal 30s schedule tick…');
    const deadline = Date.now() + 40_000;
    let persisted: PersistedRun | undefined;
    while (Date.now() < deadline) {
      persisted = db.prepare(
        `SELECT id, planned_at AS plannedAt, source, status,
                issue_id AS issueId, linked_run_id AS linkedRunId, error
         FROM automation_run WHERE rule_id = ? ORDER BY created_at DESC LIMIT 1`,
      ).get(ruleId) as PersistedRun | undefined;
      if (persisted?.source === 'schedule' && persisted.status === 'skipped') break;
      await sleep(500);
    }
    if (!persisted || persisted.source !== 'schedule' || persisted.status !== 'skipped') {
      fail(`worker did not persist the expected schedule skipped run within 40s: ${JSON.stringify(persisted)}`);
    }
    if (!persisted.error?.includes('本机未运行，未补跑')) {
      fail(`schedule skipped reason is not explicit enough: ${persisted.error ?? '(empty)'}`);
    }
    if (persisted.issueId || persisted.linkedRunId) {
      fail(`late schedule skip must not create Issue/AgentRun links: ${JSON.stringify(persisted)}`);
    }
    const sideEffects = db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM issue WHERE origin_rule_id = ?) AS issues,
         (SELECT COUNT(*) FROM agent_run WHERE id = ?) AS linkedRuns`,
    ).get(ruleId, persisted.linkedRunId ?? '') as { issues: number; linkedRuns: number };
    if (sideEffects.issues !== 0 || sideEffects.linkedRuns !== 0) {
      fail(`late schedule skip had side effects: ${JSON.stringify(sideEffects)}`);
    }

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });
    const rulesResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === '/api/automation/rules',
    );
    await page.goto(`${WEB}/automation`, { waitUntil: 'domcontentloaded' });
    const response = await rulesResponse;
    if (new URL(response.url()).origin !== SERVER) {
      fail(`browser Automation page used ${new URL(response.url()).origin}, expected ${SERVER}`);
    }
    const row = page.locator('tr').filter({ hasText: ruleName }).first();
    await row.waitFor({ state: 'visible' });
    await row.getByRole('button', { name: '最近执行' }).click();
    const runsPanel = page.getByTestId(`automation-rule-runs-${ruleId}`);
    await runsPanel.waitFor({ state: 'visible' });
    await page.getByTitle(persisted.error).waitFor({ state: 'visible' });
    const runsText = await runsPanel.innerText();
    if (!runsText.includes('已跳过') || !runsText.includes('本机未运行，未补跑')) {
      fail(`Automation recent runs do not show truthful skipped state: ${runsText}`);
    }
    if (await runsPanel.getByTestId('automation-linked-run').count() !== 0) {
      fail('late schedule skip unexpectedly shows a linked AgentRun');
    }
    console.log('  ✅ real worker schedule skip is visible in Automation recent runs with no linked run');
  } finally {
    await browser?.close().catch((error) => console.warn('browser cleanup failed:', error));
    try {
      if (serverOwnsFixture) {
        await api<void>('DELETE', `/api/automation/rules/${encodeURIComponent(ruleId)}`).catch(
          (error) => console.warn('automation rule cleanup API failed:', error),
        );
      }
      // API deletion cascades runs. This fallback remains scoped to the random
      // fixture even if the isolated server stopped during teardown.
      db.prepare('DELETE FROM automation_run WHERE rule_id = ?').run(ruleId);
      db.prepare('DELETE FROM automation_rule WHERE id = ?').run(ruleId);
    } catch (error) {
      console.warn('fixture cleanup failed:', error);
    } finally {
      db.close();
    }
  }

  console.log('==== Automation schedule catch-up truth E2E: PASS ====');
}

void main().catch((error) => {
  console.error('Automation schedule catch-up truth E2E: FAIL', error);
  process.exitCode = 1;
});

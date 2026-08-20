/**
 * Automation archive preserves history — isolated current-source Playwright E2E.
 *
 * Preconditions intentionally fence this test away from the everyday app/data:
 *   SERVER=http://127.0.0.1:3105 WEB=http://127.0.0.1:3104 \
 *   E2E_DB_PATH=C:/tmp/ma-automation-archive-history.e2e.db \
 *   pnpm exec tsx scripts/e2e-automation-rule-archive-history.mts
 *
 * The supplied SQLite file must already have been migrated before SERVER starts.
 * This script creates only a random disabled fixture, so neither the scheduler
 * nor any coding CLI can start while exercising the browser archive path.
 */
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

type RuleSummary = { id: string; name: string };
type RuleHistory = { id: string; enabled: boolean; archivedAt: string | null };
type AutomationRun = { id: string; status: string };
type PersistedRule = { enabled: number; archivedAt: number | null };

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

function headers(hasJsonBody: boolean): Record<string, string> {
  return {
    ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
    ...(TOKEN ? { 'X-MA-Token': TOKEN } : {}),
  };
}

async function apiResponse(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${SERVER}${path}`, {
    method,
    headers: headers(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await apiResponse(method, path, body);
  const text = await response.text();
  if (!response.ok) fail(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/**
 * A browser path on non-default ports needs the server's explicit local CORS
 * allow-list. Fail at the configuration boundary instead of timing out while
 * waiting for a React Query row that the browser was never allowed to read.
 */
async function assertBrowserOriginAllowed(): Promise<void> {
  const response = await fetch(`${SERVER}/api/automation/rules`, {
    method: 'OPTIONS',
    headers: {
      origin: WEB,
      'access-control-request-method': 'GET',
    },
    signal: AbortSignal.timeout(15_000),
  });
  const allowedOrigin = response.headers.get('access-control-allow-origin');
  if (!response.ok || allowedOrigin !== WEB) {
    fail(
      `SERVER must allow the isolated WEB origin ${WEB}; set MA_CORS_ORIGIN=${WEB} before starting SERVER (received ${allowedOrigin ?? 'no allow-origin header'})`,
    );
  }
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

function assertMigratedArchiveColumn(db: Database.Database): void {
  const columns = db.pragma('table_info(automation_rule)') as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'archived_at')) {
    fail('E2E_DB_PATH lacks automation_rule.archived_at; run db:migrate before starting SERVER');
  }
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  assertMigratedArchiveColumn(db);
  await assertBrowserOriginAllowed();

  const suffix = randomUUID().slice(0, 8);
  const now = Date.now();
  const workspaceId = `e2e-archive-ws-${suffix}`;
  const agentId = `e2e-archive-agent-${suffix}`;
  const issueId = `e2e-archive-issue-${suffix}`;
  const agentRunId = `e2e-archive-run-${suffix}`;
  const ruleId = `e2e-archive-rule-${suffix}`;
  const ruleName = `E2E archive history ${suffix}`;
  let fixtureInserted = false;
  let serverOwnsFixture = false;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    // This fixture is disabled before the server can see it: the browser only
    // archives, so no scheduler / Run Now / reconcile path can launch a CLI.
    db.prepare(
      `INSERT INTO workspace (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
    ).run(workspaceId, `E2E archive workspace ${suffix}`, now);
    db.prepare(
      `INSERT INTO agent (id, name, runtime, concurrency, created_at) VALUES (?, ?, 'opencode', 1, ?)`,
    ).run(agentId, `E2E archive agent ${suffix}`, now);
    db.prepare(
      `INSERT INTO issue
        (id, workspace_id, identifier, title, description, status, priority, assignee_type, assignee_id,
         creator_type, creator_id, position, origin_type, origin_rule_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'todo', 'medium', 'agent', ?, 'member', 'e2e-member', 0,
               'automation', ?, ?, ?)`,
    ).run(issueId, workspaceId, `E2E-${suffix}`, `E2E archive issue ${suffix}`, agentId, ruleId, now, now);
    db.prepare(
      `INSERT INTO agent_run
        (id, issue_id, agent_id, runtime, status, kind, priority,
         is_leader, session_poisoned, attempt, max_attempts, error, created_at)
       VALUES (?, ?, ?, 'opencode', 'failed', 'issue', 'medium', 0, 0, 1, 2, 'fixture failure', ?)`,
    ).run(agentRunId, issueId, agentId, now);
    db.prepare(
      `INSERT INTO automation_rule
        (id, name, enabled, archived_at, schedule_kind, interval_minutes, daily_time, cron_expression,
         assignee_type, assignee_id, title_template, body_template, execution_mode,
         last_planned_at, created_at, updated_at)
       VALUES (?, ?, 0, NULL, 'interval_minutes', 15, NULL, NULL,
               'agent', ?, ?, 'fixture history', 'create_issue', NULL, ?, ?)`,
    ).run(ruleId, ruleName, agentId, `E2E archive ${suffix}`, now, now);
    db.prepare(
      `INSERT INTO automation_run
        (id, rule_id, planned_at, source, status, issue_id, linked_run_id, error, created_at, updated_at)
       VALUES
        (?, ?, ?, 'schedule', 'failed', ?, ?, 'fixture failed', ?, ?),
        (?, ?, ?, 'schedule', 'skipped', NULL, NULL, 'fixture skipped', ?, ?),
        (?, ?, ?, 'manual', 'pending_dispatch', ?, NULL, 'fixture pending', ?, ?)`,
    ).run(
      `e2e-archive-auto-failed-${suffix}`, ruleId, now - 30_000, issueId, agentRunId, now - 30_000, now - 30_000,
      `e2e-archive-auto-skipped-${suffix}`, ruleId, now - 20_000, now - 20_000, now - 20_000,
      `e2e-archive-auto-pending-${suffix}`, ruleId, now - 10_000, issueId, now - 10_000, now - 10_000,
    );
    fixtureInserted = true;

    // Ownership guard: only mutate through SERVER after it exposes our random
    // direct-DB fixture, proving SERVER is attached to E2E_DB_PATH.
    const rules = await api<RuleSummary[]>('GET', '/api/automation/rules');
    if (!rules.some((rule) => rule.id === ruleId && rule.name === ruleName)) {
      fail(`SERVER did not expose the E2E fixture rule; refusing browser mutation (${SERVER})`);
    }
    serverOwnsFixture = true;

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });
    await page.goto(`${WEB}/automation`, { waitUntil: 'domcontentloaded' });
    const row = page.getByTestId(`automation-rule-row-${ruleId}`);
    await row.waitFor({ state: 'visible' });
    // The rule row proves the page rendered our random server-owned fixture.
    // Resource Timing avoids a fragile race with React Query's first response.
    const rulesUrl = `${SERVER}/api/automation/rules`;
    const browserUsedIsolatedRulesApi = await page.evaluate(
      (expectedRulesUrl) =>
        performance
          .getEntriesByType('resource')
          .some((entry) => entry.name === expectedRulesUrl),
      rulesUrl,
    );
    if (!browserUsedIsolatedRulesApi) {
      fail(`browser Automation page did not request its rule list from ${rulesUrl}`);
    }
    await page.getByTestId(`automation-archive-${ruleId}`).click();
    const dialog = page.getByTestId('confirm-dialog');
    await dialog.waitFor({ state: 'visible' });
    if ((await page.getByTestId('confirm-dialog-title').innerText()) !== '归档自动化规则？') {
      fail('archive confirmation title is not truthful');
    }
    const description = await page.getByTestId('confirm-dialog-description').innerText();
    if (!description.includes('停止后续计划') || !description.includes('保留已有执行记录')) {
      fail(`archive confirmation must explain retention semantics: ${description}`);
    }

    const archiveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname === `/api/automation/rules/${ruleId}`,
    );
    await page.getByTestId('confirm-dialog-confirm').click();
    const archivedResponse = await archiveResponse;
    if (new URL(archivedResponse.url()).origin !== SERVER || archivedResponse.status() !== 204) {
      fail(`browser archive response was not isolated successful DELETE: ${archivedResponse.status()} ${archivedResponse.url()}`);
    }
    await row.waitFor({ state: 'detached' });
    const toast = page.locator('.toast--success').filter({ hasText: '已停止后续计划，执行记录已保留' }).last();
    await toast.waitFor({ state: 'visible' });

    const storedRule = db.prepare(
      `SELECT enabled, archived_at AS archivedAt FROM automation_rule WHERE id = ?`,
    ).get(ruleId) as PersistedRule | undefined;
    if (!storedRule || storedRule.enabled !== 0 || storedRule.archivedAt == null) {
      fail(`archive DB state is not durable: ${JSON.stringify(storedRule)}`);
    }
    const persistedRuns = db.prepare(
      `SELECT id, status FROM automation_run WHERE rule_id = ? ORDER BY planned_at`,
    ).all(ruleId) as AutomationRun[];
    if (
      persistedRuns.length !== 3 ||
      !['failed', 'skipped', 'pending_dispatch'].every((status) =>
        persistedRuns.some((run) => run.status === status),
      )
    ) {
      fail(`archive lost AutomationRun history: ${JSON.stringify(persistedRuns)}`);
    }
    const issueCount = db.prepare(`SELECT COUNT(*) AS count FROM issue WHERE id = ?`).get(issueId) as { count: number };
    const agentRunCount = db.prepare(`SELECT COUNT(*) AS count FROM agent_run WHERE id = ?`).get(agentRunId) as { count: number };
    if (issueCount.count !== 1 || agentRunCount.count !== 1) {
      fail(`archive lost linked Issue / AgentRun evidence: ${JSON.stringify({ issueCount, agentRunCount })}`);
    }

    const activeAfterArchive = await api<RuleSummary[]>('GET', '/api/automation/rules');
    if (activeAfterArchive.some((rule) => rule.id === ruleId)) {
      fail('archived rule still appears in the default active-rule API list');
    }
    const ruleHistory = await api<RuleHistory>('GET', `/api/automation/rules/${ruleId}`);
    if (ruleHistory.archivedAt == null || ruleHistory.enabled) {
      fail(`by-id history read lost archive state: ${JSON.stringify(ruleHistory)}`);
    }
    const runsHistory = await api<AutomationRun[]>('GET', `/api/automation/rules/${ruleId}/runs?limit=20`);
    if (runsHistory.length !== 3) fail(`history runs endpoint lost records: ${JSON.stringify(runsHistory)}`);

    const blocked = await Promise.all([
      apiResponse('PATCH', `/api/automation/rules/${ruleId}`, { titleTemplate: 'must not persist' }),
      apiResponse('POST', `/api/automation/rules/${ruleId}/run-now`),
      apiResponse('POST', `/api/automation/runs/e2e-archive-auto-pending-${suffix}/reconcile`),
    ]);
    if (blocked.some((response) => response.status !== 409)) {
      fail(`archived actions must all return 409, got ${blocked.map((response) => response.status).join(', ')}`);
    }
    const afterBlockedRuns = db.prepare(
      `SELECT COUNT(*) AS count FROM automation_run WHERE rule_id = ?`,
    ).get(ruleId) as { count: number };
    const afterBlockedAgentRuns = db.prepare(
      `SELECT COUNT(*) AS count FROM agent_run WHERE id = ?`,
    ).get(agentRunId) as { count: number };
    if (afterBlockedRuns.count !== 3 || afterBlockedAgentRuns.count !== 1) {
      fail(`blocked archived actions produced side effects: ${JSON.stringify({ afterBlockedRuns, afterBlockedAgentRuns })}`);
    }

    console.log('  ✅ browser archive hides active rule, retains history, and blocks all new work without a CLI');
  } finally {
    await browser?.close().catch((error) => console.warn('browser cleanup failed:', error));
    try {
      if (fixtureInserted && serverOwnsFixture) {
        // Keep cleanup scoped and API-visible; DELETE is intentionally archive,
        // so direct SQL below removes only our random isolated fixture.
        await api<void>('DELETE', `/api/automation/rules/${encodeURIComponent(ruleId)}`).catch(
          (error) => console.warn('archive fixture API cleanup failed:', error),
        );
      }
      if (fixtureInserted) {
        db.prepare(`DELETE FROM automation_run WHERE rule_id = ?`).run(ruleId);
        db.prepare(`DELETE FROM agent_run WHERE id = ?`).run(agentRunId);
        db.prepare(`DELETE FROM issue WHERE id = ?`).run(issueId);
        db.prepare(`DELETE FROM automation_rule WHERE id = ?`).run(ruleId);
        db.prepare(`DELETE FROM agent WHERE id = ?`).run(agentId);
        db.prepare(`DELETE FROM workspace WHERE id = ?`).run(workspaceId);
      }
    } catch (error) {
      console.warn('fixture cleanup failed:', error);
    } finally {
      db.close();
    }
  }

  console.log('==== Automation archive preserves history E2E: PASS ====');
}

void main().catch((error) => {
  console.error('Automation archive preserves history E2E: FAIL', error);
  process.exitCode = 1;
});

/**
 * Automation skipped-streak drilldown — isolated current-source Playwright E2E.
 *
 * Preconditions deliberately fence this read-only UI check away from everyday
 * services/data:
 *   SERVER=http://127.0.0.1:3107 WEB=http://127.0.0.1:3106 \
 *   E2E_DB_PATH=C:/tmp/ma-automation-skipped-streak.e2e.db \
 *   pnpm exec tsx scripts/e2e-automation-skipped-streak-drilldown.mts
 *
 * The supplied SQLite file must have been migrated and seeded before SERVER
 * starts. The fixture rule is disabled and its linked AgentRun is already
 * terminal, so this browser path can only read audit history; it cannot start
 * the scheduler or a coding CLI.
 */
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

type RuleSummary = { id: string; name: string; skippedStreak: number };
type PersistedCount = { count: number };
type PersistedAgentRun = { status: string };

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

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SERVER}${path}`, {
    method,
    headers: headers(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) fail(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/** A browser on an isolated non-default port needs an explicit CORS allow-list. */
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

function assertMigratedAndSeeded(db: Database.Database): void {
  const columns = db.pragma('table_info(automation_rule)') as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'archived_at')) {
    fail('E2E_DB_PATH lacks the current automation_rule.archived_at migration; run db:migrate first');
  }
  const seededWorkspace = db.prepare(`SELECT COUNT(*) AS count FROM workspace WHERE id = 'ws-local'`).get() as PersistedCount;
  const seededAgent = db.prepare(`SELECT COUNT(*) AS count FROM agent WHERE id = 'agt-lead'`).get() as PersistedCount;
  if (seededWorkspace.count !== 1 || seededAgent.count !== 1) {
    fail('E2E_DB_PATH must be seeded (missing ws-local or agt-lead); run db:seed before SERVER');
  }
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  assertMigratedAndSeeded(db);
  await assertBrowserOriginAllowed();

  const suffix = randomUUID().slice(0, 8);
  const now = Date.now();
  const issueId = `e2e-skipped-issue-${suffix}`;
  const agentRunId = `e2e-skipped-run-${suffix}`;
  const ruleId = `e2e-skipped-rule-${suffix}`;
  const ruleName = `E2E skipped streak ${suffix}`;
  const pendingRunId = `e2e-skipped-pending-${suffix}`;
  const skipped = [
    { id: `e2e-skipped-newest-${suffix}`, plannedAt: now - 1_000, error: `E2E 最新跳过原因 ${suffix}` },
    { id: `e2e-skipped-middle-${suffix}`, plannedAt: now - 2_000, error: `E2E 中间跳过原因 ${suffix}` },
    { id: `e2e-skipped-earliest-${suffix}`, plannedAt: now - 3_000, error: `E2E 最早跳过原因 ${suffix}` },
  ];
  let fixtureInserted = false;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    // The fixture is disabled before SERVER can observe it. Its linked run is
    // terminal, so neither scheduler nor run worker has eligible work.
    const insertFixture = db.transaction(() => {
      db.prepare(
        `INSERT INTO issue
          (id, workspace_id, identifier, title, description, status, priority, assignee_type, assignee_id,
           creator_type, creator_id, position, origin_type, origin_rule_id, created_at, updated_at)
         VALUES (?, 'ws-local', ?, ?, NULL, 'todo', 'medium', 'agent', 'agt-lead',
                 'member', 'e2e-member', 0, 'automation', ?, ?, ?)`,
      ).run(issueId, `E2E-${suffix}`, `E2E skipped issue ${suffix}`, ruleId, now, now);
      db.prepare(
        `INSERT INTO agent_run
          (id, issue_id, agent_id, runtime, status, kind, priority,
           is_leader, session_poisoned, attempt, max_attempts, error, created_at)
         VALUES (?, ?, 'agt-lead', 'opencode', 'failed', 'issue', 'medium',
                 0, 0, 1, 1, 'E2E terminal fixture', ?)`,
      ).run(agentRunId, issueId, now);
      db.prepare(
        `INSERT INTO automation_rule
          (id, name, enabled, archived_at, schedule_kind, interval_minutes, daily_time, cron_expression,
           assignee_type, assignee_id, title_template, body_template, execution_mode,
           last_planned_at, created_at, updated_at)
         VALUES (?, ?, 0, NULL, 'interval_minutes', 15, NULL, NULL,
                 'agent', 'agt-lead', ?, 'fixture history', 'create_issue', NULL, ?, ?)`,
      ).run(ruleId, ruleName, `E2E skipped ${suffix}`, now, now);
      const insertAutomationRun = db.prepare(
        `INSERT INTO automation_run
          (id, rule_id, planned_at, source, status, issue_id, linked_run_id, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const run of skipped) {
        insertAutomationRun.run(
          run.id,
          ruleId,
          run.plannedAt,
          'schedule',
          'skipped',
          null,
          null,
          run.error,
          run.plannedAt,
          run.plannedAt,
        );
      }
      insertAutomationRun.run(
        pendingRunId,
        ruleId,
        now - 4_000,
        'manual',
        'pending_dispatch',
        issueId,
        agentRunId,
        `E2E 可重新派发原因 ${suffix}`,
        now - 4_000,
        now - 4_000,
      );
    });
    insertFixture();
    fixtureInserted = true;

    // Ownership guard: a response containing the random direct-DB fixture
    // proves SERVER uses this E2E database before browser navigation.
    const rules = await api<RuleSummary[]>('GET', '/api/automation/rules');
    const fixtureRule = rules.find((rule) => rule.id === ruleId && rule.name === ruleName);
    if (!fixtureRule || fixtureRule.skippedStreak !== 3) {
      fail(`SERVER did not expose expected skipped fixture; refusing browser path: ${JSON.stringify(fixtureRule)}`);
    }

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });
    const unexpectedMutations: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === SERVER && !['GET', 'OPTIONS'].includes(request.method())) {
        unexpectedMutations.push(`${request.method()} ${url.pathname}`);
      }
    });

    await page.goto(`${WEB}/automation`, { waitUntil: 'domcontentloaded' });
    const row = page.getByTestId(`automation-rule-row-${ruleId}`);
    await row.waitFor({ state: 'visible' });
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

    const warning = page.getByTestId(`automation-skipped-streak-${ruleId}`);
    await warning.waitFor({ state: 'visible' });
    if ((await warning.getAttribute('aria-expanded')) !== 'false') {
      fail('skipped streak warning must start collapsed');
    }
    const runsResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'GET' &&
        url.origin === SERVER &&
        url.pathname === `/api/automation/rules/${ruleId}/runs` &&
        url.searchParams.get('limit') === '20'
      );
    });
    await warning.focus();
    await warning.press('Enter');
    const response = await runsResponse;
    if (response.status() !== 200) {
      fail(`skipped drilldown did not receive a successful 20-record response: ${response.status()}`);
    }

    const skippedGroup = page.getByTestId(`automation-skipped-group-${ruleId}`);
    await skippedGroup.waitFor({ state: 'visible' });
    if ((await skippedGroup.getAttribute('aria-expanded')) !== 'false') {
      fail('skipped drilldown must show the collapsed summary before individual audit records');
    }
    const focusedTestId = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? null,
    );
    if (focusedTestId !== `automation-skipped-group-${ruleId}`) {
      fail(`warning should move keyboard context to skipped summary, got ${focusedTestId ?? 'none'}`);
    }
    const summaryText = await page.getByTestId(`automation-skipped-summary-${ruleId}`).innerText();
    if (!summaryText.includes('最近计划') || !summaryText.includes(skipped[0].error)) {
      fail(`skipped summary must state latest plan and reason: ${summaryText}`);
    }

    await skippedGroup.click();
    if ((await skippedGroup.getAttribute('aria-expanded')) !== 'true') {
      fail('skipped details toggle did not open');
    }
    for (const run of skipped) {
      const detail = page.getByTestId(`automation-skipped-detail-${run.id}`);
      await detail.waitFor({ state: 'visible' });
      const detailText = await detail.innerText();
      if (!detailText.includes('来源：schedule') || !detailText.includes('计划时刻：') || !detailText.includes(run.error)) {
        fail(`skipped detail omitted audit evidence: ${detailText}`);
      }
    }

    const pendingRepair = page.getByTestId(`automation-reconcile-${pendingRunId}`);
    await pendingRepair.waitFor({ state: 'visible' });
    const linkedIssue = page.getByTestId(`automation-linked-issue-${pendingRunId}`);
    const linkedIssueHref = await linkedIssue.getAttribute('href');
    if (linkedIssueHref !== `/issues/${issueId}`) {
      fail(`ordinary pending record lost Issue deep link: ${linkedIssueHref}`);
    }
    const linkedRun = page.getByTestId('automation-linked-run');
    const linkedHref = await linkedRun.getAttribute('href');
    if (linkedHref !== `/runs?run=${encodeURIComponent(agentRunId)}`) {
      fail(`ordinary pending record lost linked Run deep link: ${linkedHref}`);
    }
    if (unexpectedMutations.length > 0) {
      fail(`read-only skipped drilldown sent mutation requests: ${unexpectedMutations.join(', ')}`);
    }

    const runCount = db.prepare(`SELECT COUNT(*) AS count FROM automation_run WHERE rule_id = ?`).get(ruleId) as PersistedCount;
    const issueCount = db.prepare(`SELECT COUNT(*) AS count FROM issue WHERE id = ?`).get(issueId) as PersistedCount;
    const agentRun = db.prepare(`SELECT status FROM agent_run WHERE id = ?`).get(agentRunId) as PersistedAgentRun | undefined;
    if (runCount.count !== 4 || issueCount.count !== 1 || agentRun?.status !== 'failed') {
      fail(`read-only drilldown altered audit/CLI state: ${JSON.stringify({ runCount, issueCount, agentRun })}`);
    }

    console.log('  ✅ keyboard drilldown fetched 20 records, grouped skips, retained pending repair/link, and made no work');
  } finally {
    await browser?.close().catch((error) => console.warn('browser cleanup failed:', error));
    try {
      if (fixtureInserted) {
        // Direct cleanup is deliberately limited to this random isolated fixture;
        // it must also run when the SERVER ownership guard rejects the browser
        // path. DELETE /rules is an archive operation, not a physical deletion.
        db.prepare(`DELETE FROM automation_run WHERE rule_id = ?`).run(ruleId);
        db.prepare(`DELETE FROM agent_run WHERE id = ?`).run(agentRunId);
        db.prepare(`DELETE FROM issue WHERE id = ?`).run(issueId);
        db.prepare(`DELETE FROM automation_rule WHERE id = ?`).run(ruleId);
      }
    } catch (error) {
      console.warn('fixture cleanup failed:', error);
    } finally {
      db.close();
    }
  }

  console.log('==== Automation skipped streak drilldown E2E: PASS ====');
}

void main().catch((error) => {
  console.error('Automation skipped streak drilldown E2E: FAIL', error);
  process.exitCode = 1;
});

/**
 * G8-7 archived Agent dispatch fence — isolated current-source Playwright E2E.
 *
 * Required isolated startup (example):
 *   DB_PATH=C:/tmp/ma-archived-agent-dispatch.e2e.db MA_ENQUEUE_ALLOW_NOT_READY=1 \
 *   MA_CORS_ORIGIN=http://127.0.0.1:3125 pnpm dev:server -- --port 3124
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:3124/api pnpm dev:web -- --port 3125
 *   SERVER=http://127.0.0.1:3124 WEB=http://127.0.0.1:3125 \
 *   E2E_DB_PATH=C:/tmp/ma-archived-agent-dispatch.e2e.db \
 *   pnpm exec tsx scripts/e2e-archived-agent-dispatch-fence.mts
 *
 * The DB must already be migrated and seeded. The random fixture uses
 * concurrency=0: every accepted future dispatch remains queued, so this
 * browser drill never starts a coding CLI.
 */
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

type Count = { count: number };
type AgentSummary = { id: string; name: string };
type AgentRun = {
  id: string;
  status: string;
  startedAt?: string | null;
};
type AutomationRun = {
  id: string;
  status: string;
  issueId: string | null;
  linkedRunId: string | null;
  error: string | null;
};
type QuickRunResponse = { run: { id: string; status: string; startedAt?: string | null } };

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
    throw new Error(`E2E_DB_PATH must already be a migrated isolated SQLite file: ${path}`);
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

async function assertBrowserOriginAllowed(): Promise<void> {
  const response = await fetch(`${SERVER}/api/agents`, {
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
      `SERVER must allow isolated WEB origin ${WEB}; set MA_CORS_ORIGIN=${WEB} before starting SERVER (received ${allowedOrigin ?? 'no allow-origin header'})`,
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

function assertMigratedAndSeeded(db: Database.Database): { memberId: string } {
  const agentColumns = db.pragma('table_info(agent)') as Array<{ name: string }>;
  const runColumns = db.pragma('table_info(agent_run)') as Array<{ name: string }>;
  if (!agentColumns.some((column) => column.name === 'archived_at')) {
    fail('E2E_DB_PATH lacks agent.archived_at; run db:migrate before starting SERVER');
  }
  if (!runColumns.some((column) => column.name === 'fire_at')) {
    fail('E2E_DB_PATH lacks current deferred-run columns; run db:migrate before starting SERVER');
  }
  const workspace = db
    .prepare(`SELECT COUNT(*) AS count FROM workspace WHERE id = 'ws-local'`)
    .get() as Count;
  const member = db.prepare(`SELECT id FROM user ORDER BY id LIMIT 1`).get() as { id: string } | undefined;
  if (workspace.count !== 1 || !member) {
    fail('E2E_DB_PATH must be seeded (missing ws-local or local user); run db:seed first');
  }
  return { memberId: member.id };
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  const { memberId } = assertMigratedAndSeeded(db);
  await assertBrowserOriginAllowed();

  const suffix = randomUUID().slice(0, 8);
  const now = Date.now();
  const agentId = `e2e-archive-agent-${suffix}`;
  const agentName = `E2E archived Agent ${suffix}`;
  const issueId = `e2e-archive-issue-${suffix}`;
  const ruleId = `e2e-archive-rule-${suffix}`;
  const ruleName = `E2E archived Run Now ${suffix}`;
  const initialRunIds = {
    queued: `e2e-archive-queued-${suffix}`,
    waiting: `e2e-archive-waiting-${suffix}`,
    deferred: `e2e-archive-deferred-${suffix}`,
    running: `e2e-archive-running-${suffix}`,
  };
  let quickRunId: string | null = null;
  let fixtureInserted = false;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    // Direct random fixture only; concurrency=0 is the no-CLI fence even if a
    // server worker observes it before browser archive is clicked.
    db.transaction(() => {
      db.prepare(
        `INSERT INTO agent
          (id, name, category, runtime, concurrency, instructions, invocation_permission, created_at)
         VALUES (?, ?, 'E2E', 'opencode', 0, '', 'auto', ?)`,
      ).run(agentId, agentName, now);
      db.prepare(
        `INSERT INTO issue
          (id, workspace_id, identifier, title, description, status, priority,
           assignee_type, assignee_id, creator_type, creator_id, position, created_at, updated_at)
         VALUES (?, 'ws-local', ?, ?, NULL, 'todo', 'medium',
                 'agent', ?, 'member', ?, 0, ?, ?)`,
      ).run(issueId, `E2E-ARCH-${suffix}`, `E2E archive issue ${suffix}`, agentId, memberId, now, now);
      const insertRun = db.prepare(
        `INSERT INTO agent_run
          (id, issue_id, agent_id, runtime, status, kind, priority,
           is_leader, session_poisoned, attempt, max_attempts,
           started_at, last_heartbeat_at, waiting_local_entered_at, fire_at, created_at)
         VALUES (?, ?, ?, 'opencode', ?, 'issue', 'medium',
                 0, 0, 1, 2, ?, ?, ?, ?, ?)`,
      );
      insertRun.run(initialRunIds.queued, issueId, agentId, 'queued', null, null, null, null, now - 4_000);
      insertRun.run(initialRunIds.waiting, issueId, agentId, 'waiting_local_directory', null, null, now - 3_000, null, now - 3_000);
      insertRun.run(initialRunIds.deferred, issueId, agentId, 'deferred', null, null, null, now + 60_000, now - 2_000);
      // This one is deliberately legacy in-flight evidence; the archive route
      // must transition it through abort/cancel, not delete its history.
      insertRun.run(initialRunIds.running, issueId, agentId, 'running', now - 1_000, now - 500, null, null, now - 1_000);
      db.prepare(
        `INSERT INTO automation_rule
          (id, name, enabled, archived_at, schedule_kind, interval_minutes, daily_time, cron_expression,
           assignee_type, assignee_id, title_template, body_template, execution_mode,
           last_planned_at, created_at, updated_at)
         VALUES (?, ?, 0, NULL, 'interval_minutes', 15, NULL, NULL,
                 'agent', ?, ?, '', 'run_only', NULL, ?, ?)`,
      ).run(ruleId, ruleName, agentId, `E2E archived target ${suffix}`, now, now);
    })();
    fixtureInserted = true;

    // Server ownership guard: refuse UI mutation if the configured SERVER is
    // not attached to this random, e2e-named SQLite fixture.
    const activeAgents = await api<AgentSummary[]>('GET', '/api/agents?archived=0');
    if (!activeAgents.some((agent) => agent.id === agentId && agent.name === agentName)) {
      fail(`SERVER did not expose random Agent fixture; refusing browser mutation against ${SERVER}`);
    }

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });

    // Browser archive path is the product lifecycle entry point.
    await page.goto(`${WEB}/agents`, { waitUntil: 'domcontentloaded' });
    const agentRow = page.locator('tr').filter({ hasText: agentName });
    await agentRow.waitFor({ state: 'visible' });
    const archiveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'DELETE' && url.origin === SERVER && url.pathname === `/api/agents/${agentId}`;
    });
    await agentRow.getByTestId('agent-list-archive').click();
    await page.getByTestId('confirm-dialog').waitFor({ state: 'visible' });
    const confirmation = await page.getByTestId('confirm-dialog-description').innerText();
    if (!confirmation.includes('归档')) fail(`Agent archive confirmation is not visible/truthful: ${confirmation}`);
    await page.getByTestId('confirm-dialog-confirm').click();
    const archiveResponse = await archiveResponsePromise;
    if (archiveResponse.status() !== 204) {
      fail(`browser Agent archive did not return 204: ${archiveResponse.status()} ${archiveResponse.url()}`);
    }
    await agentRow.waitFor({ state: 'detached' });

    const lifecycleRows = db.prepare(
      `SELECT id, status, started_at AS startedAt FROM agent_run WHERE id IN (?, ?, ?, ?) ORDER BY id`,
    ).all(
      initialRunIds.queued,
      initialRunIds.waiting,
      initialRunIds.deferred,
      initialRunIds.running,
    ) as Array<{ id: string; status: string; startedAt: number | null }>;
    if (lifecycleRows.length !== 4 || lifecycleRows.some((row) => row.status !== 'cancelled')) {
      fail(`archive did not honestly cancel queued/waiting/deferred/running history: ${JSON.stringify(lifecycleRows)}`);
    }
    const agentStored = db.prepare(`SELECT archived_at AS archivedAt FROM agent WHERE id = ?`).get(agentId) as { archivedAt: number | null } | undefined;
    if (agentStored?.archivedAt == null) fail('Agent archive timestamp was not persisted');
    console.log('  ✅ browser archive cancels queued/waiting/deferred/running via lifecycle and preserves rows');

    // The archived detail is an intentional neutral state: it remains
    // inspectable, but no future-dispatch CTA promises a launch.
    await page.goto(`${WEB}/agents/${encodeURIComponent(agentId)}`, { waitUntil: 'domcontentloaded' });
    const recovery = page.getByTestId('agent-readiness-recovery');
    await recovery.waitFor({ state: 'visible' });
    if ((await recovery.getAttribute('data-status')) !== 'archived') {
      fail(`Agent detail did not report archived readiness: ${await recovery.getAttribute('data-status')}`);
    }
    await page.getByTestId('agent-archived-dispatch-note').waitFor({ state: 'visible' });
    if (!(await page.getByTestId('agent-dm-chat').isDisabled())) fail('archived Agent still enables private chat dispatch');
    if (!(await page.getByTestId('agent-direct-issue-create-disabled').isDisabled())) {
      fail('archived Agent still exposes an enabled future Issue dispatch CTA');
    }

    // A real manual quick-run API call cannot escape through
    // MA_ENQUEUE_ALLOW_NOT_READY and leaves no new AgentRun.
    const countBeforeRejectedManual = db.prepare(`SELECT COUNT(*) AS count FROM agent_run WHERE agent_id = ?`).get(agentId) as Count;
    const manualRejected = await apiResponse('POST', '/api/quick-runs', {
      prompt: `E2E archived manual reject ${suffix}`,
      assignee: { type: 'agent', id: agentId },
    });
    const manualText = await manualRejected.text();
    if (manualRejected.status !== 409) fail(`archived quick run returned ${manualRejected.status}: ${manualText}`);
    const manualBody = JSON.parse(manualText) as { reason?: string; enqueue?: { reason?: string } };
    if (manualBody.reason !== 'agent_archived' || manualBody.enqueue?.reason !== 'agent_archived') {
      fail(`archived quick run was not explainably skipped: ${manualText}`);
    }
    const countAfterRejectedManual = db.prepare(`SELECT COUNT(*) AS count FROM agent_run WHERE agent_id = ?`).get(agentId) as Count;
    if (countAfterRejectedManual.count !== countBeforeRejectedManual.count) {
      fail('archived manual quick-run created a new AgentRun');
    }

    // Automation Run Now deliberately remains clickable so it can persist the
    // truthful skipped audit row; 201 here means audit recorded, not launch.
    await page.goto(`${WEB}/automation`, { waitUntil: 'domcontentloaded' });
    const ruleRow = page.getByTestId(`automation-rule-row-${ruleId}`);
    await ruleRow.waitFor({ state: 'visible' });
    await page.getByTestId(`automation-archived-target-${ruleId}`).waitFor({ state: 'visible' });
    const runNowResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.origin === SERVER && url.pathname === `/api/automation/rules/${ruleId}/run-now`;
    });
    await page.getByTestId(`automation-run-now-${ruleId}`).click();
    const runNowResponse = await runNowResponsePromise;
    if (runNowResponse.status() !== 201) fail(`Run Now must persist an audit row, got ${runNowResponse.status()}`);
    const runNow = (await runNowResponse.json()) as AutomationRun;
    if (runNow.status !== 'skipped' || runNow.linkedRunId !== null || !runNow.error?.includes('已归档')) {
      fail(`Run Now reported a fake start instead of archived skip: ${JSON.stringify(runNow)}`);
    }
    await page.getByTestId(`automation-rule-runs-${ruleId}`).waitFor({ state: 'visible' });
    const skippedSummary = await page.getByTestId(`automation-skipped-summary-${ruleId}`).innerText();
    if (!skippedSummary.includes('已归档')) fail(`Automation UI hid archived skip reason: ${skippedSummary}`);
    const automationAgentRunCount = db.prepare(`SELECT COUNT(*) AS count FROM agent_run WHERE agent_id = ?`).get(agentId) as Count;
    if (automationAgentRunCount.count !== countBeforeRejectedManual.count) {
      fail('archived Automation Run Now created an AgentRun');
    }
    console.log('  ✅ manual Quick Run rejects and Automation Run Now shows persisted archived skip; no CLI/run starts');

    // Recovery only clears archivedAt. Use the real detail-page control, then
    // prove prior cancelled rows stay terminal and a new direct run can queue.
    await page.goto(`${WEB}/agents/${encodeURIComponent(agentId)}`, { waitUntil: 'domcontentloaded' });
    const unarchiveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'PATCH' && url.origin === SERVER && url.pathname === `/api/agents/${agentId}`;
    });
    await page.getByTestId('agent-detail-unarchive').click();
    const unarchiveResponse = await unarchiveResponsePromise;
    if (unarchiveResponse.status() !== 200) fail(`unarchive failed: ${unarchiveResponse.status()}`);
    await page.getByTestId('agent-direct-issue-create').waitFor({ state: 'visible' });

    const postUnarchiveRows = db.prepare(
      `SELECT id, status FROM agent_run WHERE id IN (?, ?, ?, ?)`,
    ).all(
      initialRunIds.queued,
      initialRunIds.waiting,
      initialRunIds.deferred,
      initialRunIds.running,
    ) as Array<{ id: string; status: string }>;
    if (postUnarchiveRows.some((row) => row.status !== 'cancelled')) {
      fail(`unarchive illegally revived historical runs: ${JSON.stringify(postUnarchiveRows)}`);
    }
    const accepted = await api<QuickRunResponse>('POST', '/api/quick-runs', {
      prompt: `E2E after unarchive ${suffix}`,
      assignee: { type: 'agent', id: agentId },
    });
    quickRunId = accepted.run.id;
    if (accepted.run.status !== 'queued') {
      fail(`unarchived Agent did not return a queued Quick Run: ${JSON.stringify(accepted)}`);
    }
    // Let a wake/tick cycle run. concurrency=0 must still prevent a spawn.
    await page.waitForTimeout(750);
    const queuedAfterRecovery = db.prepare(
      `SELECT status, started_at AS startedAt FROM agent_run WHERE id = ?`,
    ).get(quickRunId) as { status: string; startedAt: number | null } | undefined;
    if (!queuedAfterRecovery || queuedAfterRecovery.status !== 'queued' || queuedAfterRecovery.startedAt != null) {
      fail(`recovered Agent Quick Run was executed instead of safely queued: ${JSON.stringify(queuedAfterRecovery)}`);
    }
    const history = await api<AgentRun[]>('GET', `/api/agents/${encodeURIComponent(agentId)}/runs?limit=20`);
    if (!history.some((run) => run.id === initialRunIds.running && run.status === 'cancelled')) {
      fail('Agent run history endpoint lost a cancelled archived row');
    }
    console.log('  ✅ unarchive only reopens future queueing; cancelled history remains terminal and concurrency=0 prevents CLI');
  } finally {
    await browser?.close().catch((error) => console.warn('browser cleanup failed:', error));
    try {
      if (fixtureInserted) {
        // Random-fixture-only cleanup; remove non-cascading audit dependencies
        // before the source rows, and run even on any browser/assertion error.
        db.transaction(() => {
          db.prepare(`DELETE FROM inbox_item WHERE issue_id = ?`).run(issueId);
          db.prepare(`DELETE FROM activity_log WHERE issue_id = ?`).run(issueId);
          db.prepare(`DELETE FROM comment WHERE issue_id = ?`).run(issueId);
          db.prepare(`DELETE FROM automation_run WHERE rule_id = ?`).run(ruleId);
          db.prepare(`DELETE FROM agent_run WHERE agent_id = ?`).run(agentId);
          db.prepare(`DELETE FROM issue WHERE id = ?`).run(issueId);
          db.prepare(`DELETE FROM automation_rule WHERE id = ?`).run(ruleId);
          db.prepare(`DELETE FROM agent WHERE id = ?`).run(agentId);
        })();
      }
    } catch (error) {
      console.warn('fixture cleanup failed:', error);
    } finally {
      db.close();
    }
  }

  console.log('==== Archived Agent dispatch fence E2E: PASS ====');
}

void main().catch((error) => {
  console.error('Archived Agent dispatch fence E2E: FAIL', error);
  process.exitCode = 1;
});

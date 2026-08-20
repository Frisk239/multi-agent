/**
 * Bulk assignment dispatch parity — isolated current-source Playwright E2E.
 *
 * Required start-up fence (example):
 *   SERVER=http://127.0.0.1:3112 WEB=http://127.0.0.1:3113 \
 *   E2E_DB_PATH=C:/tmp/ma-bulk-assignment.e2e.db \
 *   pnpm exec tsx scripts/e2e-bulk-assignment-dispatch-parity.mts
 *
 * The supplied DB must already be migrated and seeded, and SERVER must have
 * been started with DB_PATH=E2E_DB_PATH, MA_CORS_ORIGIN=WEB, and
 * MA_ENQUEUE_ALLOW_NOT_READY=1. The random fixture agents have concurrency=0:
 * this verifies real queued rows while ensuring the run worker cannot launch a
 * coding CLI during the browser flow.
 */
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

type PersistedCount = { count: number };
type PersistedRun = {
  id: string;
  issue_id: string;
  agent_id: string;
  status: string;
  started_at: number | null;
};
type IssueList = { data: Array<{ id: string; title: string }> };
type RunsList = {
  data: Array<{ id: string; issueId: string | null; agentId: string; status: string }>;
};
type BulkAssignResponse = {
  success: boolean;
  updatedCount: number;
  enqueuedCount: number;
  skippedCount: number;
  notApplicableCount: number;
  results: Array<{ issueId: string; enqueue: { status: string; runId?: string | null } }>;
  skipped: unknown[];
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
  if (!response.ok) {
    fail(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/** A browser on a non-default port needs its explicit local CORS allow-list. */
async function assertBrowserOriginAllowed(): Promise<void> {
  const response = await fetch(`${SERVER}/api/issues`, {
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
      `SERVER must allow isolated WEB origin ${WEB}; start SERVER with MA_CORS_ORIGIN=${WEB} (received ${allowedOrigin ?? 'no allow-origin header'})`,
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
  const issueColumns = db.pragma('table_info(issue)') as Array<{ name: string }>;
  if (!issueColumns.some((column) => column.name === 'assignee_type')) {
    fail('E2E_DB_PATH lacks the current issue assignee columns; run db:migrate first');
  }
  const workspace = db
    .prepare(`SELECT COUNT(*) AS count FROM workspace WHERE id = 'ws-local'`)
    .get() as PersistedCount;
  const member = db.prepare(`SELECT COUNT(*) AS count FROM user`).get() as PersistedCount;
  if (workspace.count !== 1 || member.count < 1) {
    fail('E2E_DB_PATH must be seeded (missing ws-local or local user); run db:seed first');
  }
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  assertMigratedAndSeeded(db);
  await assertBrowserOriginAllowed();

  const suffix = randomUUID().slice(0, 8);
  const now = Date.now();
  const targetAgentId = `e2e-bulk-target-${suffix}`;
  const oldAgentId = `e2e-bulk-old-${suffix}`;
  const issueAId = `e2e-bulk-issue-a-${suffix}`;
  const issueBId = `e2e-bulk-issue-b-${suffix}`;
  const oldRunId = `e2e-bulk-old-run-${suffix}`;
  const titleA = `E2E bulk dispatch A ${suffix}`;
  const titleB = `E2E bulk dispatch B ${suffix}`;
  const member = db.prepare(`SELECT id FROM user ORDER BY id LIMIT 1`).get() as { id: string } | undefined;
  if (!member) fail('E2E_DB_PATH must contain a local member');

  let fixtureInserted = false;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    db.transaction(() => {
      // concurrency=0 prevents worker claim. MA_ENQUEUE_ALLOW_NOT_READY makes
      // this test independent of host CLI discovery while preserving real
      // queue insertion; no script path invokes a CLI.
      const insertAgent = db.prepare(
        `INSERT INTO agent
          (id, name, category, runtime, concurrency, instructions, invocation_permission, created_at)
         VALUES (?, ?, 'E2E', 'opencode', 0, '', 'auto', ?)`,
      );
      insertAgent.run(targetAgentId, `E2E target ${suffix}`, now);
      insertAgent.run(oldAgentId, `E2E old ${suffix}`, now);

      const insertIssue = db.prepare(
        `INSERT INTO issue
          (id, workspace_id, identifier, title, description, status, priority,
           assignee_type, assignee_id, creator_type, creator_id, position, created_at, updated_at)
         VALUES (?, 'ws-local', ?, ?, NULL, 'todo', 'medium',
                 'agent', ?, 'member', ?, 0, ?, ?)`,
      );
      insertIssue.run(issueAId, `E2E-A-${suffix}`, titleA, oldAgentId, member.id, now, now);
      insertIssue.run(issueBId, `E2E-B-${suffix}`, titleB, oldAgentId, member.id, now, now);

      // Existing active work must survive batch reassignment. Its own agent is
      // also concurrency=0, so the worker cannot execute it during this check.
      db.prepare(
        `INSERT INTO agent_run
          (id, issue_id, agent_id, runtime, status, kind, priority,
           is_leader, session_poisoned, attempt, max_attempts, started_at, last_heartbeat_at, created_at)
         VALUES (?, ?, ?, 'opencode', 'running', 'issue', 'medium',
                 0, 0, 1, 1, ?, ?, ?)`,
      ).run(oldRunId, issueAId, oldAgentId, now, now, now);
    })();
    fixtureInserted = true;

    // Ownership guard: this random direct-DB fixture must be observable from
    // SERVER before browser interaction, proving it is not pointed at another
    // database.
    const listed = await api<IssueList>('GET', '/api/issues?status=todo&limit=100');
    const listedIds = new Set(listed.data.map((issue) => issue.id));
    if (!listedIds.has(issueAId) || !listedIds.has(issueBId)) {
      fail('SERVER did not expose the random isolated issue fixtures');
    }

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });
    const mutationRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === SERVER && !['GET', 'OPTIONS'].includes(request.method())) {
        mutationRequests.push(`${request.method()} ${url.pathname}`);
      }
    });

    await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
    // Test id and data-id live on the same article. Keep the direct locator to
    // avoid a text match accidentally selecting an unrelated seed card.
    const directCardA = page.locator(`[data-testid="issue-card"][data-issue-id="${issueAId}"]`);
    const directCardB = page.locator(`[data-testid="issue-card"][data-issue-id="${issueBId}"]`);
    await directCardA.waitFor({ state: 'visible' });
    await directCardB.waitFor({ state: 'visible' });
    await directCardA.scrollIntoViewIfNeeded();
    await directCardA.locator('input[type="checkbox"]').check();
    await directCardB.scrollIntoViewIfNeeded();
    await directCardB.locator('input[type="checkbox"]').check();
    await page.getByTestId('kanban-bulk-bar').waitFor({ state: 'visible' });
    if ((await page.getByTestId('kanban-bulk-count').innerText()) !== '已选择 2 项') {
      fail('board did not retain both selected fixture cards');
    }

    const bulkResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'POST' &&
        url.origin === SERVER &&
        url.pathname === '/api/issues/bulk-assign'
      );
    });
    await page
      .getByTestId('kanban-bulk-assignee')
      .selectOption(`agent:${targetAgentId}`);
    const bulkResponse = await bulkResponsePromise;
    if (bulkResponse.status() !== 200) {
      fail(`bulk assign UI request returned ${bulkResponse.status()}`);
    }
    const receipt = (await bulkResponse.json()) as BulkAssignResponse;
    if (
      !receipt.success ||
      receipt.updatedCount !== 2 ||
      receipt.enqueuedCount !== 2 ||
      receipt.skippedCount !== 0 ||
      receipt.notApplicableCount !== 0 ||
      receipt.results.length !== 2 ||
      receipt.results.some((result) => result.enqueue.status !== 'queued')
    ) {
      fail(`bulk receipt was not an honest two-card dispatch: ${JSON.stringify(receipt)}`);
    }
    const resultIds = receipt.results.map((result) => result.issueId).sort();
    if (resultIds.join(',') !== [issueAId, issueBId].sort().join(',')) {
      fail(`bulk receipt did not attribute only changed fixture cards: ${JSON.stringify(resultIds)}`);
    }
    await page.getByText('已更改 2 项指派，已入队 2 项', { exact: true }).waitFor();

    // Give a wake/tick cycle a chance: concurrency=0 must keep the new work
    // queued, proving this E2E did not start a runtime/CLI.
    await page.waitForTimeout(750);
    const persistedNewRuns = db
      .prepare(
        `SELECT id, issue_id, agent_id, status, started_at
         FROM agent_run WHERE agent_id = ? AND issue_id IN (?, ?) ORDER BY issue_id`,
      )
      .all(targetAgentId, issueAId, issueBId) as PersistedRun[];
    if (
      persistedNewRuns.length !== 2 ||
      persistedNewRuns.some((run) => run.status !== 'queued' || run.started_at != null)
    ) {
      fail(`fixture runs were not safely queued without execution: ${JSON.stringify(persistedNewRuns)}`);
    }
    const oldRun = db
      .prepare(`SELECT id, issue_id, agent_id, status, started_at FROM agent_run WHERE id = ?`)
      .get(oldRunId) as PersistedRun | undefined;
    if (oldRun?.status !== 'running' || oldRun.agent_id !== oldAgentId) {
      fail(`bulk assignment cancelled or altered the existing active run: ${JSON.stringify(oldRun)}`);
    }

    const runsForA = await api<RunsList>('GET', `/api/runs?issueId=${encodeURIComponent(issueAId)}`);
    const runsForB = await api<RunsList>('GET', `/api/runs?issueId=${encodeURIComponent(issueBId)}`);
    const hasQueuedTarget = (runs: RunsList, issueId: string) =>
      runs.data.some(
        (run) =>
          run.issueId === issueId && run.agentId === targetAgentId && run.status === 'queued',
      );
    if (!hasQueuedTarget(runsForA, issueAId) || !hasQueuedTarget(runsForB, issueBId)) {
      fail('GET /api/runs did not expose both actual queued bulk-dispatch runs');
    }
    if (mutationRequests.join(',') !== 'POST /api/issues/bulk-assign') {
      fail(`browser sent unexpected mutation requests: ${mutationRequests.join(', ') || 'none'}`);
    }

    console.log('  ✅ board multi-select produced two queued runs, truthful toast/receipt, and retained old active work without a CLI');
  } finally {
    await browser?.close().catch((error) => console.warn('browser cleanup failed:', error));
    try {
      if (fixtureInserted) {
        // Cleanup is direct, random-fixture-only, and runs even when browser
        // checks fail. Inbox has no FK to issue, so remove it explicitly.
        db.transaction(() => {
          db.prepare(`DELETE FROM inbox_item WHERE issue_id IN (?, ?)`).run(issueAId, issueBId);
          db.prepare(`DELETE FROM activity_log WHERE issue_id IN (?, ?)`).run(issueAId, issueBId);
          db.prepare(`DELETE FROM agent_run WHERE issue_id IN (?, ?)`).run(issueAId, issueBId);
          db.prepare(`DELETE FROM issue WHERE id IN (?, ?)`).run(issueAId, issueBId);
          db.prepare(`DELETE FROM agent WHERE id IN (?, ?)`).run(targetAgentId, oldAgentId);
        })();
      }
    } catch (error) {
      console.warn('fixture cleanup failed:', error);
    } finally {
      db.close();
    }
  }

  console.log('==== Bulk assignment dispatch parity E2E: PASS ====');
}

void main().catch((error) => {
  console.error('Bulk assignment dispatch parity E2E: FAIL', error);
  process.exitCode = 1;
});

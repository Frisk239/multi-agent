/**
 * Agent detail → direct Issue creation — isolated current-source Playwright acceptance.
 *
 * Preconditions (all three are intentionally explicit so this script cannot fall back to a
 * user's everyday server/database):
 * - SERVER points to an isolated current-source server
 * - WEB points to a current-source web configured to use that SERVER
 * - E2E_DB_PATH is that isolated server's SQLite file and its filename contains `e2e`
 *
 * The isolated DB must have at least one Agent whose runtime is currently `ready`. The script
 * derives that runtime, creates and later removes its own Agent fixture, then sets
 * workspace.max_concurrent_runs=0 while exercising the real Issue → enqueue path. This keeps
 * the created run queued and prevents the run worker from starting a local CLI process.
 *
 * Example (after starting isolated services on non-default ports):
 *   SERVER=http://127.0.0.1:3101 WEB=http://127.0.0.1:3100 \
 *   E2E_DB_PATH=C:/tmp/ma-agent-direct-issue-create.e2e.db \
 *   pnpm exec tsx scripts/e2e-agent-direct-issue-create.mts
 */
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for isolated E2E`);
  return value;
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

const SERVER = requiredEnv('SERVER').replace(/\/$/, '');
const WEB = requiredEnv('WEB').replace(/\/$/, '');
const DB_PATH = isolatedDbPath();
const TOKEN = process.env.MA_LOCAL_TOKEN ?? process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '';

type AgentSummary = {
  id: string;
  runtime: string;
  archivedAt?: string | null;
};

type AgentReadiness = {
  status: string;
};

type WorkspaceRow = {
  id: string;
  maxConcurrentRuns: number | null;
};

type IssueRow = {
  id: string;
  title: string;
  assigneeType: string | null;
  assigneeId: string | null;
};

type RunRow = {
  id: string;
  agentId: string;
  status: string;
  kind: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function apiHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(TOKEN ? { 'X-MA-Token': TOKEN } : {}),
  };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SERVER}${path}`, {
    method,
    headers: apiHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    fail(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
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

function directDeleteIssue(db: Database.Database, issueId: string): void {
  // Match the route's dependency order, but only for this random fixture id. This is a
  // fallback if the isolated server is no longer reachable during cleanup.
  db.prepare('DELETE FROM issue_to_label WHERE issue_id = ?').run(issueId);
  db.prepare('DELETE FROM issue_subscriber WHERE issue_id = ?').run(issueId);
  db.prepare('DELETE FROM comment WHERE issue_id = ?').run(issueId);
  db.prepare('DELETE FROM activity_log WHERE issue_id = ?').run(issueId);
  db.prepare('DELETE FROM inbox_item WHERE issue_id = ?').run(issueId);
  db.prepare('DELETE FROM wiki_ingest_job WHERE issue_id = ?').run(issueId);
  db.prepare('UPDATE agent_run SET issue_id = NULL WHERE issue_id = ?').run(issueId);
  db.prepare('DELETE FROM issue WHERE id = ?').run(issueId);
}

function deleteFixtureRuns(db: Database.Database, runIds: readonly string[]): void {
  for (const runId of runIds) {
    db.prepare('DELETE FROM run_execution_owner WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM run_message WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM inbox_item WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM agent_run WHERE id = ?').run(runId);
  }
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  const suffix = randomUUID().slice(0, 8);
  const agentId = `e2e-direct-issue-agent-${suffix}`;
  const title = `E2E 直接分配 Issue ${suffix}`;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  let issueId: string | null = null;
  let runIds: string[] = [];
  let workspace: WorkspaceRow | null = null;
  let capacityTemporarilyChanged = false;

  try {
    const webProbe = await fetch(WEB, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!webProbe || webProbe.status >= 500) fail(`WEB unavailable: ${WEB}`);

    const existingAgents = await api<AgentSummary[]>('GET', '/api/agents');
    if (existingAgents.length === 0) {
      fail('isolated server has no active Agent from which to derive a ready runtime');
    }
    const readiness = await api<Record<string, AgentReadiness>>(
      'GET',
      `/api/agents/readiness?ids=${encodeURIComponent(existingAgents.map((agent) => agent.id).join(','))}`,
    );
    const readySource = existingAgents.find(
      (agent) => agent.archivedAt == null && readiness[agent.id]?.status === 'ready',
    );
    if (!readySource) {
      fail('isolated server has no readiness=ready Agent; configure one real runtime before E2E');
    }

    workspace = (db
      .prepare(
        `SELECT id, max_concurrent_runs AS maxConcurrentRuns
         FROM workspace WHERE id = 'ws-local'`,
      )
      .get() as WorkspaceRow | undefined) ?? null;
    if (!workspace) fail(`isolated DB lacks the ws-local workspace fixture: ${DB_PATH}`);

    // Enqueue remains real; the worker's claim path observes this cap and must leave it queued.
    db.prepare('UPDATE workspace SET max_concurrent_runs = 0 WHERE id = ?').run(workspace.id);
    capacityTemporarilyChanged = true;
    db.prepare(
      `INSERT INTO agent (id, name, runtime, concurrency, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    ).run(agentId, `E2E 直接分配 Agent ${suffix}`, readySource.runtime, Date.now());

    // This also proves SERVER actually points at E2E_DB_PATH before the browser can mutate it.
    const fixtureReadiness = await api<AgentReadiness>(
      'GET',
      `/api/agents/${encodeURIComponent(agentId)}/readiness`,
    );
    if (fixtureReadiness.status !== 'ready') {
      fail(`temporary agent is not ready (${fixtureReadiness.status}); runtime setup drifted`);
    }

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });

    await page.goto(`${WEB}/agents/${encodeURIComponent(agentId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByTestId('agent-overview').waitFor();

    const assign = page.getByTestId('agent-direct-issue-create');
    const assignHref = await assign.getAttribute('href');
    const expectedCreateHref = `/?new=1&createAssignee=agent:${agentId}`;
    if (assignHref !== expectedCreateHref) {
      fail(`direct assignment href mismatch: ${assignHref ?? 'null'} !== ${expectedCreateHref}`);
    }
    const assignedIssuesHref = await page.getByTestId('agent-to-board-assignee').getAttribute('href');
    const expectedAssignedIssuesHref = `/?assignee=agent:${agentId}`;
    if (assignedIssuesHref !== expectedAssignedIssuesHref) {
      fail(
        `assigned Issue filter href mismatch: ${assignedIssuesHref ?? 'null'} !== ${expectedAssignedIssuesHref}`,
      );
    }
    console.log('  ✅ Agent 详情区分“分配工作”与“查看已指派 Issue”入口');

    await assign.click();
    await page.getByTestId('new-issue-form').waitFor();
    await page.waitForFunction(
      () => {
        const url = new URL(window.location.href);
        return !url.searchParams.has('new') && !url.searchParams.has('createAssignee');
      },
      undefined,
      { timeout: 15_000 },
    );
    const selectedAssignee = await page.getByTestId('new-issue-assignee').inputValue();
    if (selectedAssignee !== `agent:${agentId}`) {
      fail(`New Issue did not preselect temporary Agent: ${selectedAssignee || '(empty)'}`);
    }
    console.log('  ✅ 详情 → 看板自动展开表单并预选目标 Agent');

    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/issues'),
    );
    await page.getByTestId('new-issue-title').fill(title);
    await page.getByTestId('new-issue-submit').click();
    const response = await createResponse;
    const responseText = await response.text();
    if (!response.ok()) {
      fail(`New Issue submit failed (${response.status()}): ${responseText.slice(0, 500)}`);
    }
    const created = JSON.parse(responseText) as { id?: string };
    issueId = created.id ?? null;
    if (!issueId) fail('New Issue response lacks id');

    const issue = db
      .prepare(
        `SELECT id, title, assignee_type AS assigneeType, assignee_id AS assigneeId
         FROM issue WHERE id = ?`,
      )
      .get(issueId) as IssueRow | undefined;
    if (!issue || issue.title !== title || issue.assigneeType !== 'agent' || issue.assigneeId !== agentId) {
      fail(`created Issue is not persisted with the selected Agent: ${JSON.stringify(issue)}`);
    }
    const run = db
      .prepare(
        `SELECT id, agent_id AS agentId, status, kind
         FROM agent_run WHERE issue_id = ? AND kind = 'issue'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(issueId) as RunRow | undefined;
    if (!run || run.agentId !== agentId || run.kind !== 'issue' || run.status !== 'queued') {
      fail(`real Issue→Run enqueue is missing or not safely queued: ${JSON.stringify(run)}`);
    }
    runIds = [run.id];
    console.log('  ✅ 真实 CreateIssueInput → Issue 持久化 → queued Issue run（worker cap=0）');
  } finally {
    await browser?.close().catch((error) => {
      console.warn('browser cleanup failed:', error);
    });

    try {
      const cleanupIssueId = issueId ?? (
        db.prepare('SELECT id FROM issue WHERE title = ? ORDER BY created_at DESC LIMIT 1').get(title) as
          | { id: string }
          | undefined
      )?.id ?? null;
      if (cleanupIssueId) {
        const discoveredRunIds = (
          db.prepare('SELECT id FROM agent_run WHERE issue_id = ?').all(cleanupIssueId) as Array<{ id: string }>
        ).map((row) => row.id);
        runIds = [...new Set([...runIds, ...discoveredRunIds])];
        await api<void>('DELETE', `/api/issues/${encodeURIComponent(cleanupIssueId)}`).catch((error) => {
          console.warn(`issue cleanup API failed for ${cleanupIssueId}:`, error);
        });
        // If the API was unavailable, remove only this random fixture's direct dependencies.
        directDeleteIssue(db, cleanupIssueId);
      }
      deleteFixtureRuns(db, runIds);
      db.prepare('DELETE FROM agent WHERE id = ?').run(agentId);
    } catch (error) {
      console.warn('fixture cleanup failed:', error);
    } finally {
      if (capacityTemporarilyChanged && workspace) {
        try {
          db.prepare('UPDATE workspace SET max_concurrent_runs = ? WHERE id = ?').run(
            workspace.maxConcurrentRuns,
            workspace.id,
          );
        } catch (error) {
          console.warn('workspace capacity restore failed:', error);
        }
      }
      db.close();
    }
  }

  console.log('==== Agent direct Issue create E2E: PASS ====');
}

void main();

/**
 * Automation Run Now truth — isolated current-source Playwright acceptance.
 *
 * Preconditions are explicit to prevent this script from talking to the everyday
 * app or database:
 *   SERVER=http://127.0.0.1:3101 WEB=http://127.0.0.1:3100 \
 *   E2E_DB_PATH=C:/tmp/ma-automation-run-now-truth.e2e.db \
 *   pnpm exec tsx scripts/e2e-automation-run-now-truth.mts
 *
 * The isolated server must be configured with a runtime absent from PATH. The
 * script creates a run_only rule for that runtime and asserts the real dispatch
 * result is skipped. Because readiness fails before enqueue, it never starts a
 * local coding CLI or creates an AgentRun.
 */
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

type RuntimeId = 'claude-code' | 'opencode' | 'cursor' | 'grok' | 'pi';

type Readiness = {
  status: string;
  detail: string | null;
};

type AutomationRun = {
  id: string;
  ruleId: string;
  status: string;
  issueId: string | null;
  linkedRunId: string | null;
  error: string | null;
};

type PersistedAutomationRun = {
  id: string;
  status: string;
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

function missingRuntime(): RuntimeId {
  const runtime = (process.env.E2E_MISSING_RUNTIME ?? 'grok').trim();
  if (!['claude-code', 'opencode', 'cursor', 'grok', 'pi'].includes(runtime)) {
    throw new Error(`E2E_MISSING_RUNTIME must be a supported runtime, got ${runtime || '(empty)'}`);
  }
  return runtime as RuntimeId;
}

const SERVER = isolatedOrigin('SERVER');
const WEB = isolatedOrigin('WEB');
const DB_PATH = isolatedDbPath();
const RUNTIME = missingRuntime();
const TOKEN = process.env.MA_LOCAL_TOKEN ?? process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '';

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

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  const suffix = randomUUID().slice(0, 8);
  const agentId = `e2e-auto-truth-agent-${suffix}`;
  const ruleName = `E2E Run Now truth ${suffix}`;
  let ruleId: string | null = null;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  let serverOwnsFixture = false;

  try {
    const webProbe = await fetch(`${WEB}/automation`, {
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!webProbe || webProbe.status >= 500) fail(`WEB unavailable: ${WEB}`);

    // Direct fixture insertion makes it possible to prove SERVER is attached to
    // E2E_DB_PATH before any browser mutation is allowed.
    db.prepare(
      `INSERT INTO agent (id, name, runtime, concurrency, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    ).run(agentId, `E2E offline ${suffix}`, RUNTIME, Date.now());

    const readiness = await api<Readiness>(
      'GET',
      `/api/agents/${encodeURIComponent(agentId)}/readiness`,
    );
    // A response for the freshly inserted random id proves SERVER is attached
    // to E2E_DB_PATH. Do not send cleanup mutations through an unverified URL.
    serverOwnsFixture = true;
    if (readiness.status !== 'runtime_missing') {
      fail(
        `temporary agent must be runtime_missing (got ${readiness.status}). ` +
          `Set E2E_MISSING_RUNTIME to an unavailable adapter for the isolated server.`,
      );
    }

    const createdRule = await api<{ id: string }>('POST', '/api/automation/rules', {
      name: ruleName,
      enabled: false,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 15,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: agentId,
      titleTemplate: `E2E run-only ${suffix}`,
      bodyTemplate: 'This must remain a skipped readiness check.',
      executionMode: 'run_only',
    });
    ruleId = createdRule.id;
    if (!ruleId) fail('POST /api/automation/rules did not return a rule id');

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });
    await page.goto(`${WEB}/automation`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('automation-page').waitFor();
    // The visible rule name shares a row with its mode badge, so its accessible
    // text is not exactly `ruleName`. The row id is the stable identity that
    // also proves the fresh API fixture reached the rendered collection.
    await page.getByTestId(`automation-rule-row-${ruleId}`).waitFor();

    const runNowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/automation/rules/${ruleId}/run-now`,
    );
    await page.getByTestId(`automation-run-now-${ruleId}`).click();
    const response = await runNowResponse;
    if (new URL(response.url()).origin !== SERVER) {
      fail(`browser Run Now used ${new URL(response.url()).origin}, expected isolated SERVER ${SERVER}`);
    }
    const payloadText = await response.text();
    if (response.status() !== 201) {
      fail(`Run Now returned ${response.status()}: ${payloadText.slice(0, 500)}`);
    }
    const run = JSON.parse(payloadText) as AutomationRun;
    if (run.status !== 'skipped' || !run.error) {
      fail(`run_only + runtime_missing must persist skipped with reason: ${payloadText}`);
    }
    if (run.issueId || run.linkedRunId) {
      fail(`offline run_only must not create Issue/Run: ${payloadText}`);
    }

    const warning = page.locator('.toast--warning').filter({ hasText: run.error }).last();
    await warning.waitFor({ state: 'visible' });
    if ((await warning.getAttribute('role')) !== 'status') {
      fail('skipped Run Now toast must be a non-error status announcement');
    }
    await page.getByTestId(`automation-rule-runs-${ruleId}`).waitFor({ state: 'visible' });
    await page.getByTitle(run.error).waitFor({ state: 'visible' });
    const runsText = await page.getByTestId(`automation-rule-runs-${ruleId}`).innerText();
    if (!runsText.includes('已跳过')) {
      fail(`auto-expanded recent runs do not show skipped status: ${runsText}`);
    }

    const persisted = db
      .prepare(
        `SELECT id, status, error FROM automation_run
         WHERE rule_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(ruleId) as PersistedAutomationRun | undefined;
    if (!persisted || persisted.id !== run.id || persisted.status !== 'skipped' || persisted.error !== run.error) {
      fail(`isolated DB lacks the real skipped AutomationRun: ${JSON.stringify(persisted)}`);
    }
    const agentRunCount = db
      .prepare('SELECT COUNT(*) AS count FROM agent_run WHERE agent_id = ?')
      .get(agentId) as { count: number };
    if (agentRunCount.count !== 0) {
      fail(`offline run_only unexpectedly created ${agentRunCount.count} AgentRun(s)`);
    }
    console.log('  ✅ real run_only + runtime_missing → skipped warning + expanded recent run');
  } finally {
    await browser?.close().catch((error) => console.warn('browser cleanup failed:', error));
    try {
      if (ruleId && serverOwnsFixture) {
        await api<void>('DELETE', `/api/automation/rules/${encodeURIComponent(ruleId)}`).catch(
          (error) => console.warn('automation rule cleanup API failed:', error),
        );
      }
      if (ruleId) {
        // API deletion cascades AutomationRuns. This fallback still scopes exactly
        // to our random fixture if the isolated server stopped during cleanup.
        db.prepare('DELETE FROM automation_run WHERE rule_id = ?').run(ruleId);
        db.prepare('DELETE FROM automation_rule WHERE id = ?').run(ruleId);
      }
      if (serverOwnsFixture) {
        await api<void>('DELETE', `/api/agents/${encodeURIComponent(agentId)}?hard=1`).catch(
          (error) => console.warn('agent cleanup API failed:', error),
        );
      }
      db.prepare('DELETE FROM agent WHERE id = ?').run(agentId);
    } catch (error) {
      console.warn('fixture cleanup failed:', error);
    } finally {
      db.close();
    }
  }

  console.log('==== Automation Run Now truth E2E: PASS ====');
}

void main().catch((error) => {
  console.error('Automation Run Now truth E2E: FAIL', error);
  process.exitCode = 1;
});

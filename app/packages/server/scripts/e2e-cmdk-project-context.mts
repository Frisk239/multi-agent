/**
 * G3-16 CmdK 项目上下文 — isolated current-source Playwright acceptance.
 *
 * Required isolated startup (example):
 *   DB_PATH=C:/tmp/ma-cmdk-project-context.e2e.db PORT=3144 \
 *   MA_CORS_ORIGIN=http://127.0.0.1:3145 pnpm dev
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:3144/api pnpm --dir ../web dev -- -p 3145
 *   SERVER=http://127.0.0.1:3144 WEB=http://127.0.0.1:3145 \
 *   E2E_DB_PATH=C:/tmp/ma-cmdk-project-context.e2e.db \
 *   pnpm exec tsx scripts/e2e-cmdk-project-context.mts
 *
 * The database must already be migrated and seeded. This script only creates a
 * random Project metadata fixture; it never enqueues work or starts a coding CLI.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

type Count = { count: number };
type ProjectResponse = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  localPath: string | null;
};
type ProjectRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  localPath: string | null;
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

function apiHeaders(hasJsonBody: boolean): Record<string, string> {
  return {
    ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
    ...(TOKEN ? { 'X-MA-Token': TOKEN } : {}),
  };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SERVER}${path}`, {
    method,
    headers: apiHeaders(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) fail(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function assertBrowserOriginAllowed(): Promise<void> {
  const response = await fetch(`${SERVER}/api/projects`, {
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

function assertMigratedAndSeeded(db: Database.Database): void {
  const columns = db.pragma('table_info(project)') as Array<{ name: string }>;
  for (const required of ['id', 'workspace_id', 'description', 'status', 'local_path']) {
    if (!columns.some((column) => column.name === required)) {
      fail(`E2E_DB_PATH lacks project.${required}; run db:migrate before starting SERVER`);
    }
  }

  const workspace = db
    .prepare(`SELECT COUNT(*) AS count FROM workspace WHERE id = 'ws-local'`)
    .get() as Count;
  const user = db.prepare('SELECT COUNT(*) AS count FROM user').get() as Count;
  if (workspace.count !== 1 || user.count < 1) {
    fail('E2E_DB_PATH must be seeded (missing ws-local or local user); run db:seed first');
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

async function openPalette(page: import('playwright').Page) {
  const input = page.getByTestId('cmdk-input');
  // A cold Next dev render can expose SSR markup before Sidebar's Ctrl+K
  // listener is hydrated. Retry the real shortcut rather than using a
  // programmatic state change or treating a visible static sidebar as ready.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (await input.isVisible()) return input;
    await page.keyboard.press('Control+k');
    try {
      await input.waitFor({ state: 'visible', timeout: 700 });
      return input;
    } catch {
      await page.waitForTimeout(150);
    }
  }
  fail('CmdK shortcut did not become interactive after hydration');
}

async function closePalette(page: import('playwright').Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByTestId('cmdk-dialog').waitFor({ state: 'detached' });
}

async function assertProjectSearch(
  page: import('playwright').Page,
  project: ProjectResponse,
  query: string,
  expectedPath: string,
): Promise<void> {
  const input = await openPalette(page);
  await input.fill(query);
  const row = page.getByTestId(`cmdk-item-project-${project.id}`);
  await row.waitFor({ state: 'visible' });
  const text = await row.innerText();
  if (!text.includes(project.title) || !text.includes('进行中') || !text.includes(expectedPath)) {
    fail(`project row is missing title/status/path for ${query}: ${text}`);
  }
  if (text.includes(project.id)) {
    fail(`project row leaked internal id as visible text: ${text}`);
  }
  await closePalette(page);
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  assertMigratedAndSeeded(db);
  await assertBrowserOriginAllowed();

  const suffix = randomUUID().slice(0, 8);
  const title = `E2E CmdK 项目 ${suffix}`;
  const descriptionNeedle = `cmdk-description-${suffix}`;
  const pathNeedle = `cmdk-path-${suffix}`;
  const localPath = resolve(process.cwd(), `.e2e-${pathNeedle}`);
  let projectId: string | null = null;
  let serverOwnsFixture = false;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    const webProbe = await fetch(`${WEB}/`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!webProbe || webProbe.status >= 500) fail(`WEB unavailable: ${WEB}`);

    const created = await api<ProjectResponse>('POST', '/api/projects', {
      title,
      description: `项目描述 ${descriptionNeedle}`,
      status: 'active',
      localPath,
    });
    projectId = created.id;
    if (!projectId || created.title !== title || created.description?.includes(descriptionNeedle) !== true) {
      fail(`POST /api/projects returned an unexpected fixture: ${JSON.stringify(created)}`);
    }

    // This direct random-row read proves SERVER points at E2E_DB_PATH before a
    // browser can mutate anything, and enables only scoped cleanup below.
    const persisted = db
      .prepare(
        `SELECT id, title, description, status, local_path AS localPath
         FROM project WHERE id = ?`,
      )
      .get(projectId) as ProjectRow | undefined;
    if (
      !persisted ||
      persisted.title !== title ||
      persisted.description?.includes(descriptionNeedle) !== true ||
      persisted.status !== 'active' ||
      !persisted.localPath?.includes(pathNeedle)
    ) {
      fail(`SERVER does not own the E2E project fixture: ${JSON.stringify(persisted)}`);
    }
    serverOwnsFixture = true;

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
    });
    await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
    // Keep the initial page check, but let openPalette verify actual keyboard
    // interactivity below; visible SSR markup alone is not a hydration fence.
    await page.getByTestId('app-sidebar').waitFor({ state: 'visible' });
    // Warm the actual Ctrl+K path once, then close it. The first acceptance
    // path below will open it with the same shortcut again.
    await openPalette(page);
    await closePalette(page);

    // First path proves Ctrl+K → title query → Enter reaches the real detail page.
    const titleInput = await openPalette(page);
    await titleInput.fill(title);
    const titleRow = page.getByTestId(`cmdk-item-project-${projectId}`);
    await titleRow.waitFor({ state: 'visible' });
    await titleInput.press('Enter');
    await page.waitForURL((url) => url.pathname === `/projects/${projectId}`);
    const detailTitle = page.getByTestId('project-title');
    await detailTitle.waitFor({ state: 'visible' });
    if ((await detailTitle.innerText()) !== title) {
      fail(`CmdK Enter reached a project detail with the wrong title: ${await detailTitle.innerText()}`);
    }
    console.log('  ✅ Ctrl+K title query → Enter → project detail');

    // Secondary fields remain local cached matching, not a new backend search endpoint.
    await assertProjectSearch(page, created, descriptionNeedle, localPath);
    console.log('  ✅ CmdK description query finds the same project with status and directory');
    await assertProjectSearch(page, created, pathNeedle, localPath);
    console.log('  ✅ CmdK local-path query finds the same project');

    const emptyInput = await openPalette(page);
    if ((await emptyInput.inputValue()) !== '') fail('new CmdK palette must start with an empty query');
    const projectsNav = page.getByTestId('cmdk-item-nav-projects');
    await projectsNav.waitFor({ state: 'visible' });
    await projectsNav.click();
    await page.waitForURL((url) => url.pathname === '/projects');
    await page.getByTestId('projects-page').waitFor({ state: 'visible' });
    console.log('  ✅ empty CmdK keeps 项目 navigation → /projects');
  } finally {
    await browser?.close().catch((error) => console.warn('browser cleanup failed:', error));
    try {
      if (projectId && serverOwnsFixture) {
        await api<void>('DELETE', `/api/projects/${encodeURIComponent(projectId)}`).catch((error) => {
          console.warn('project cleanup API failed:', error);
        });
      }
      if (projectId && serverOwnsFixture) {
        // Fallback only ever scopes to this random fixture if the isolated server
        // stopped after ownership was established.
        db.prepare('DELETE FROM project WHERE id = ?').run(projectId);
      }
    } catch (error) {
      console.warn('fixture cleanup failed:', error);
    } finally {
      db.close();
    }
  }

  console.log('==== CmdK project context E2E: PASS ====');
}

void main().catch((error) => {
  console.error('CmdK project context E2E: FAIL', error);
  process.exitCode = 1;
});

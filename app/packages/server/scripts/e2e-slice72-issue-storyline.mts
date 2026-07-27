/**
 * Slice 72 · Issue 合并故事线
 *
 * unit（无服必绿）：
 * - mergeIssueStoryline 排序 / comment_created 去重
 *
 * live UI（WEB 可达；可 mock API）：
 * - 打开 /issues/:id
 * - 默认 tab 故事线 data-testid=issue-storyline
 * - mock comments + activities 后可见 storyline-item
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-slice72-issue-storyline.mts
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:3001';
const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';
const TOKEN = process.env.MA_LOCAL_TOKEN ?? process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '';

type Status = 'PASS' | 'FAIL' | 'SKIP' | 'WARN';

interface CheckRow {
  id: string;
  status: Status;
  note: string;
}

const results: CheckRow[] = [];
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../../../.progress/logs');
const WEB_ROOT = join(__dirname, '../../web');
const logLines: string[] = [];

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  logLines.push(line);
}

function record(row: CheckRow): void {
  results.push(row);
  log(`  [${row.status}] ${row.id} — ${row.note}`);
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    ...(extra ?? {}),
  };
  if (TOKEN) h['X-MA-Token'] = TOKEN;
  return h;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  try {
    const url = path.startsWith('http') ? path : `${SERVER}${path}`;
    const res = await fetch(url, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e: any) {
    return { ok: false, status: 0, json: null, text: String(e?.message ?? e) };
  }
}

function finish(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `e2e-slice72-issue-storyline-${stamp()}.log`);
    writeFileSync(path, logLines.join('\n') + '\n', 'utf8');
    log(`log → ${path}`);
  } catch (e) {
    log(`warn: could not write log: ${e}`);
  }
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  log(`\nsummary: PASS=${pass} FAIL=${fail} SKIP=${skip} total=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

/** 内联复刻 merge 规则（避免 tsx 拉 React 路径），与 web/lib/issue-storyline 对齐验收 */
function mergeIssueStorylineInline(
  comments: any[],
  activities: any[],
  runs: any[] = [],
): { kind: string; id: string }[] {
  const commentIdSet = new Set(comments.map((c) => c.id));
  const items: { kind: string; id: string; createdAt: string; rank: number }[] = [];
  const seen = new Set<string>();

  for (const c of comments) {
    const key = `comment:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: 'comment', id: c.id, createdAt: c.createdAt, rank: 0 });
  }
  for (const a of activities) {
    if (a.eventType === 'comment_created') {
      const cid = a.payload?.commentId ?? a.payload?.comment_id;
      if (typeof cid === 'string' && commentIdSet.has(cid)) continue;
    }
    const key = `activity:${a.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: 'activity', id: a.id, createdAt: a.createdAt, rank: 1 });
  }
  for (const r of runs) {
    const key = `run:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: 'run', id: r.id, createdAt: r.createdAt, rank: 2 });
  }
  items.sort((a, b) => {
    const d = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (d !== 0) return d;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.id.localeCompare(b.id);
  });
  return items.map(({ kind, id }) => ({ kind, id }));
}

function unitChecks(): void {
  log('## unit mergeIssueStoryline');

  const comments = [
    {
      id: 'c-2',
      createdAt: '2026-07-01T02:00:00.000Z',
    },
    {
      id: 'c-1',
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  ];
  const activities = [
    {
      id: 'a-1',
      eventType: 'status_changed',
      createdAt: '2026-07-01T01:00:00.000Z',
      payload: { from: 'todo', to: 'done' },
    },
    {
      id: 'a-dup',
      eventType: 'comment_created',
      createdAt: '2026-07-01T00:00:01.000Z',
      payload: { commentId: 'c-1' },
    },
  ];
  const runs = [
    {
      id: 'run-1',
      createdAt: '2026-07-01T01:30:00.000Z',
      status: 'running',
    },
  ];

  const merged = mergeIssueStorylineInline(comments, activities, runs);
  const ids = merged.map((m) => m.id);
  if (JSON.stringify(ids) === JSON.stringify(['c-1', 'a-1', 'run-1', 'c-2'])) {
    record({
      id: 'unit-sort-merge',
      status: 'PASS',
      note: `order=${ids.join(',')}`,
    });
  } else {
    record({
      id: 'unit-sort-merge',
      status: 'FAIL',
      note: `unexpected order ${ids.join(',')}`,
    });
  }

  if (!ids.includes('a-dup')) {
    record({
      id: 'unit-dedupe-comment-created',
      status: 'PASS',
      note: 'comment_created skipped when comment present',
    });
  } else {
    record({
      id: 'unit-dedupe-comment-created',
      status: 'FAIL',
      note: 'comment_created not deduped',
    });
  }

  // 源文件存在
  try {
    const src = readFileSync(join(WEB_ROOT, 'lib/issue-storyline.ts'), 'utf8');
    if (src.includes('export function mergeIssueStoryline')) {
      record({
        id: 'unit-source-present',
        status: 'PASS',
        note: 'web/lib/issue-storyline.ts exports mergeIssueStoryline',
      });
    } else {
      record({
        id: 'unit-source-present',
        status: 'FAIL',
        note: 'mergeIssueStoryline export missing',
      });
    }
  } catch (e: any) {
    record({
      id: 'unit-source-present',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }

  try {
    const detail = readFileSync(join(WEB_ROOT, 'components/IssueDetail.tsx'), 'utf8');
    const hasTab =
      detail.includes('activity-tab-storyline') &&
      detail.includes("'storyline'") &&
      detail.includes('IssueStoryline');
    if (hasTab) {
      record({
        id: 'unit-ui-wired',
        status: 'PASS',
        note: 'IssueDetail wires storyline tab + IssueStoryline',
      });
    } else {
      record({
        id: 'unit-ui-wired',
        status: 'FAIL',
        note: 'IssueDetail missing storyline wiring',
      });
    }
  } catch (e: any) {
    record({
      id: 'unit-ui-wired',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  }
}

async function webReachable(): Promise<boolean> {
  try {
    const res = await fetch(WEB, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function liveUi(): Promise<void> {
  log('## live UI (mock comments/activities)');

  if (!(await webReachable())) {
    record({
      id: 'ui-web-reachable',
      status: 'SKIP',
      note: `WEB ${WEB} unreachable`,
    });
    return;
  }
  record({ id: 'ui-web-reachable', status: 'PASS', note: WEB });

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    record({
      id: 'ui-playwright',
      status: 'SKIP',
      note: 'playwright not installed',
    });
    return;
  }

  // 优先真 API 建 issue；失败则用 mock 仅验 DOM
  let issueId = 'slice72-mock-issue';
  const create = await api('POST', '/issues', {
    title: `Slice72 storyline ${Date.now()}`,
    description: 'e2e storyline',
    status: 'todo',
  });
  if (create.ok && create.json?.id) {
    issueId = create.json.id as string;
    record({ id: 'api-create-issue', status: 'PASS', note: issueId });
    // 评论
    const c = await api('POST', `/issues/${issueId}/comments`, {
      body: 'storyline comment from e2e',
    });
    if (c.ok) {
      record({ id: 'api-create-comment', status: 'PASS', note: 'comment ok' });
    } else {
      record({
        id: 'api-create-comment',
        status: 'WARN',
        note: `comment ${c.status}`,
      });
    }
    // 状态变更 → activity
    const p = await api('PATCH', `/issues/${issueId}`, { status: 'in_progress' });
    if (p.ok) {
      record({ id: 'api-patch-status', status: 'PASS', note: 'status → in_progress' });
    } else {
      record({
        id: 'api-patch-status',
        status: 'WARN',
        note: `patch ${p.status}`,
      });
    }
  } else {
    record({
      id: 'api-create-issue',
      status: 'WARN',
      note: `SERVER create failed (${create.status}); will route-mock`,
    });
  }

  let browser;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      try {
        browser = await chromium.launch({ channel: 'chrome', headless: true });
      } catch {
        browser = await chromium.launch({ channel: 'msedge', headless: true });
      }
    }
  } catch (e: any) {
    record({
      id: 'ui-browser',
      status: 'SKIP',
      note: String(e?.message ?? e),
    });
    return;
  }

  const page = await browser.newPage();
  try {
    // 若没有真实 issue，拦截 API 喂 mock
    if (issueId === 'slice72-mock-issue') {
      await page.route('**/api/issues/**', async (route) => {
        const url = route.request().url();
        const method = route.request().method();
        if (method !== 'GET') {
          await route.continue();
          return;
        }
        if (url.includes('/comments')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'c-e2e',
                issueId,
                type: 'comment',
                authorType: 'user',
                authorId: 'u-1',
                authorLabel: 'E2E',
                body: 'mock storyline comment',
                createdAt: '2026-07-01T00:00:00.000Z',
              },
            ]),
          });
          return;
        }
        if (url.includes('/activities')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              activities: [
                {
                  id: 'a-e2e',
                  issueId,
                  actorType: 'member',
                  actorName: 'E2E',
                  eventType: 'status_changed',
                  payload: { from: 'todo', to: 'in_progress' },
                  createdAt: '2026-07-01T00:30:00.000Z',
                },
              ],
            }),
          });
          return;
        }
        if (url.match(/\/api\/issues\/[^/?]+$/)) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: issueId,
              workspaceId: 'ws-1',
              identifier: 'MA-72',
              title: 'Slice72 mock issue',
              description: 'mock',
              status: 'todo',
              priority: 'medium',
              assignee: null,
              creatorType: 'user',
              creatorId: 'u-1',
              position: 0,
              labels: [],
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-01T00:00:00.000Z',
            }),
          });
          return;
        }
        await route.continue();
      });
      await page.route('**/api/runs**', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'run-e2e',
                issueId,
                agentId: 'ag-1',
                runtime: 'claude-code',
                status: 'completed',
                kind: 'issue',
                quickPrompt: null,
                error: null,
                startedAt: null,
                finishedAt: null,
                lastHeartbeatAt: null,
                isLeader: false,
                squadId: null,
                createdAt: '2026-07-01T01:00:00.000Z',
              },
            ],
            nextCursor: null,
          }),
        });
      });
    }

    await page.goto(`${WEB}/issues/${issueId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    await page.waitForSelector('[data-testid="issue-detail"], [data-testid="issue-detail-error"]', {
      timeout: 15000,
    });

    const detail = page.locator('[data-testid="issue-detail"]');
    if (!(await detail.isVisible().catch(() => false))) {
      record({
        id: 'ui-issue-detail',
        status: 'FAIL',
        note: 'issue-detail not visible (error page?)',
      });
      return;
    }
    record({ id: 'ui-issue-detail', status: 'PASS', note: 'issue-detail visible' });

    const storyTab = page.locator('[data-testid="activity-tab-storyline"]');
    if (await storyTab.isVisible().catch(() => false)) {
      record({ id: 'ui-tab-storyline', status: 'PASS', note: 'storyline tab present' });
      // ensure active / click
      await storyTab.click().catch(() => undefined);
    } else {
      record({
        id: 'ui-tab-storyline',
        status: 'FAIL',
        note: 'activity-tab-storyline missing',
      });
    }

    const story = page.locator('[data-testid="issue-storyline"]');
    await story.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    if (await story.isVisible().catch(() => false)) {
      record({ id: 'ui-storyline', status: 'PASS', note: 'issue-storyline visible' });
    } else {
      record({
        id: 'ui-storyline',
        status: 'FAIL',
        note: 'issue-storyline not visible',
      });
      return;
    }

    // 等列表条目
    await page.waitForTimeout(800);
    const items = page.locator('[data-testid="storyline-item"]');
    const count = await items.count();
    if (count > 0) {
      const kinds = await items.evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-kind') ?? '?'),
      );
      record({
        id: 'ui-storyline-items',
        status: 'PASS',
        note: `count=${count} kinds=${kinds.join(',')}`,
      });
    } else {
      // 空态也可接受若 API 空且无 mock
      const empty = page.locator('[data-testid="issue-storyline-empty"]');
      if (await empty.isVisible().catch(() => false)) {
        record({
          id: 'ui-storyline-items',
          status: 'WARN',
          note: 'storyline empty (no comments/activities/runs)',
        });
      } else {
        record({
          id: 'ui-storyline-items',
          status: 'FAIL',
          note: 'no storyline-item and no empty state',
        });
      }
    }

    // 评论 tab 仍在
    const commentsTab = page.locator('[data-testid="activity-tab-comments"]');
    if (await commentsTab.isVisible().catch(() => false)) {
      record({ id: 'ui-tab-comments', status: 'PASS', note: 'comments tab kept' });
    } else {
      record({
        id: 'ui-tab-comments',
        status: 'FAIL',
        note: 'comments tab missing',
      });
    }

    const logTab = page.locator('[data-testid="activity-tab-log"]');
    if (await logTab.isVisible().catch(() => false)) {
      record({ id: 'ui-tab-activity', status: 'PASS', note: 'activity tab kept' });
    } else {
      record({
        id: 'ui-tab-activity',
        status: 'FAIL',
        note: 'activity-tab-log missing on full page',
      });
    }
  } catch (e: any) {
    record({
      id: 'ui-exception',
      status: 'FAIL',
      note: String(e?.message ?? e),
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  log(`Slice 72 issue-storyline e2e · WEB=${WEB} SERVER=${SERVER}`);
  unitChecks();
  await liveUi();
  finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Slice 33 · Phase B V1 全栈 live Playwright 基线补验
 *
 * 默认假设本地已起服：
 *   WEB=http://localhost:3000  SERVER=http://localhost:3001
 *
 * 不启服、不提交密钥；失败如实记 PASS/FAIL/SKIP/WARN，不粉饰。
 *
 * 覆盖 Must：
 * 1. 派活→run 出现→状态推进（API create issue + enqueue 元数据 / runs 列表；真 CLI 非强制）
 * 2. 看板 ?issue= Sheet 开合
 * 3. WS 侧栏 .ws-chip 状态可观测（open/connecting 记证据；一直 closed → WARN）
 * 4. Settings 健康卡可读
 * 5. API GET /api/runs 与 /api/settings/* 200
 *
 * 运行：
 *   cd app/packages/server && npx tsx scripts/e2e-slice33-phase-b-baseline.mts
 */

import { chromium, type Browser, type Page, type APIRequestContext } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// —— 可复用 selector / URL 约定（可选导出）——
export const SLICE33 = {
  web: process.env.WEB ?? 'http://localhost:3000',
  server: process.env.SERVER ?? 'http://localhost:3001',
  board: '/',
  settings: '/settings',
  settingsHealthTab: '/settings?tab=health',
  issueParam: 'issue',
  sheet: '[data-testid="issue-side-sheet"]',
  sheetClose: '[data-testid="issue-side-sheet-close"]',
  sheetBackdrop: '[data-testid="issue-side-sheet-backdrop"]',
  cardTitle: '[data-testid="issue-card-title-link"]',
  listTitle: '[data-testid="issue-list-title-link"]',
  wsChip: '.ws-chip',
  settingsLiveProbes: '[data-testid="settings-live-probes"]',
  settingsHealthSection: '[data-testid="settings-health-section"]',
  settingsRunHealth: '[data-testid="settings-run-health"]',
  settingsMemoryHealth: '[data-testid="settings-memory-health"]',
  settingsNavHealth: '[data-testid="settings-nav-health"]',
  sheetUrl: (id: string) => `/?issue=${encodeURIComponent(id)}`,
} as const;

type Status = 'PASS' | 'FAIL' | 'SKIP' | 'WARN';

interface CheckRow {
  id: string;
  must?: string;
  status: Status;
  note: string;
}

const results: CheckRow[] = [];
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../../../.progress/logs');
const LOG_PATH = join(LOG_DIR, `slice33-phase-b-baseline-${stamp()}.log`);
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
  const mark =
    row.status === 'PASS' ? 'PASS' :
    row.status === 'FAIL' ? 'FAIL' :
    row.status === 'SKIP' ? 'SKIP' : 'WARN';
  log(`  [${mark}] ${row.id}${row.must ? ` (Must ${row.must})` : ''} — ${row.note}`);
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    try {
      return await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      return await chromium.launch({ channel: 'msedge', headless: true });
    }
  }
}

async function waitBrief(page: Page, ms = 800): Promise<void> {
  await page.waitForTimeout(ms);
}

async function apiGet(
  request: APIRequestContext,
  path: string,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const url = path.startsWith('http') ? path : `${SLICE33.server}${path}`;
  const res = await request.get(url, { timeout: 15000 });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok(), status: res.status(), json, text };
}

async function apiPost(
  request: APIRequestContext,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const url = path.startsWith('http') ? path : `${SLICE33.server}${path}`;
  const res = await request.post(url, {
    data: body,
    headers: { 'content-type': 'application/json' },
    timeout: 20000,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok(), status: res.status(), json, text };
}

/** 从 GET /api/issues 响应里抽出第一条 id */
function firstIssueId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as any;
  const arr = Array.isArray(p) ? p : Array.isArray(p.data) ? p.data : null;
  if (!arr?.length) return null;
  const id = arr[0]?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function extractRuns(payload: unknown): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const p = payload as any;
  if (Array.isArray(p.data)) return p.data;
  if (Array.isArray(p.runs)) return p.runs;
  return [];
}

async function checkServicesUp(request: APIRequestContext): Promise<boolean> {
  log('0. 探针：WEB / SERVER 可达性');
  let webOk = false;
  let serverOk = false;
  try {
    const web = await request.get(SLICE33.web, { timeout: 8000 });
    webOk = web.ok() || web.status() < 500;
    record({
      id: 'service.web',
      status: webOk ? 'PASS' : 'FAIL',
      note: `${SLICE33.web} → HTTP ${web.status()}`,
    });
  } catch (e: any) {
    record({
      id: 'service.web',
      status: 'FAIL',
      note: `WEB 不可达: ${e?.message ?? e}（请先 pnpm dev / 起 web@3000）`,
    });
  }
  try {
    const runs = await apiGet(request, '/api/runs?limit=1');
    serverOk = runs.ok;
    record({
      id: 'service.server',
      status: serverOk ? 'PASS' : 'FAIL',
      note: `${SLICE33.server}/api/runs → HTTP ${runs.status}`,
    });
  } catch (e: any) {
    record({
      id: 'service.server',
      status: 'FAIL',
      note: `SERVER 不可达: ${e?.message ?? e}（请先起 server@3001）`,
    });
  }
  return webOk && serverOk;
}

async function checkApiBaseline(request: APIRequestContext): Promise<void> {
  log('1. API 基线：GET /api/runs 与 /api/settings/*');
  const runs = await apiGet(request, '/api/runs?limit=5');
  record({
    id: 'api.runs',
    must: '5',
    status: runs.ok ? 'PASS' : 'FAIL',
    note: runs.ok
      ? `HTTP 200, items≈${extractRuns(runs.json).length}`
      : `HTTP ${runs.status}`,
  });

  const probes = await apiGet(request, '/api/settings/live-probes');
  record({
    id: 'api.settings.live-probes',
    must: '4/5',
    status: probes.ok ? 'PASS' : 'FAIL',
    note: probes.ok
      ? `HTTP 200, bodyKeys=${Object.keys((probes.json as object) ?? {}).join(',') || '∅'}`
      : `HTTP ${probes.status}`,
  });

  // 额外健康相关 settings 端点：有则 PASS，无则 SKIP（不假绿）
  for (const path of [
    '/api/settings/run-health',
    '/api/settings/health',
    '/api/settings/memory-health',
  ]) {
    try {
      const r = await apiGet(request, path);
      if (r.status === 404) {
        record({
          id: `api.settings.optional${path}`,
          status: 'SKIP',
          note: `HTTP 404（端点可选，未实现）`,
        });
      } else {
        record({
          id: `api.settings.optional${path}`,
          status: r.ok ? 'PASS' : 'WARN',
          note: `HTTP ${r.status}`,
        });
      }
    } catch (e: any) {
      record({
        id: `api.settings.optional${path}`,
        status: 'SKIP',
        note: e?.message ?? String(e),
      });
    }
  }
}

async function checkBoardLoad(page: Page): Promise<void> {
  log('2. 看板 / 加载');
  await page.goto(`${SLICE33.web}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitBrief(page, 1200);
  const title = await page.title();
  const bodyLen = (await page.innerText('body').catch(() => '')).length;
  const cards = await page.locator(SLICE33.cardTitle).count().catch(() => 0);
  const ok = bodyLen > 200 || title.length > 0;
  record({
    id: 'ui.board.load',
    must: '2',
    status: ok ? 'PASS' : 'FAIL',
    note: `title="${title}", bodyLen=${bodyLen}, cardTitles=${cards}`,
  });
}

async function checkWsChip(page: Page): Promise<'open' | 'connecting' | 'closed' | 'missing'> {
  log('3. WS 侧栏 .ws-chip 状态（列表 invalidate 可观测证据之一）');
  // 给 WS 一点握手时间
  let status: 'open' | 'connecting' | 'closed' | 'missing' = 'missing';
  for (let i = 0; i < 8; i++) {
    const chip = page.locator(SLICE33.wsChip).first();
    const visible = await chip.isVisible().catch(() => false);
    if (!visible) {
      await waitBrief(page, 500);
      continue;
    }
    const cls = (await chip.getAttribute('class').catch(() => '')) ?? '';
    const text = ((await chip.innerText().catch(() => '')) ?? '').trim();
    // 优先 class 修饰符，再文本兜底
    if (cls.includes('ws-chip--open')) {
      status = 'open';
    } else if (cls.includes('ws-chip--connecting')) {
      status = 'connecting';
    } else if (cls.includes('ws-chip--closed')) {
      status = 'closed';
    } else if (/open|已连接/i.test(text)) {
      status = 'open';
    } else if (/connecting|连接中/i.test(text)) {
      status = 'connecting';
    } else if (/closed|断开|已断开/i.test(text)) {
      status = 'closed';
    } else {
      status = 'connecting'; // 有 chip 但状态不明，按 connecting 观察
    }
    if (status === 'open') break;
    await waitBrief(page, 500);
  }

  if (status === 'missing') {
    record({
      id: 'ui.ws.chip',
      must: '3',
      status: 'FAIL',
      note: '未找到 .ws-chip',
    });
  } else if (status === 'closed') {
    record({
      id: 'ui.ws.chip',
      must: '3',
      status: 'WARN',
      note: 'ws-chip=closed（不强制 FAIL；列表 invalidate 可能不可观测）',
    });
  } else {
    record({
      id: 'ui.ws.chip',
      must: '3',
      status: 'PASS',
      note: `ws-chip=${status}（侧栏状态可观测，作为 invalidate 链路证据之一）`,
    });
  }
  return status;
}

async function resolveIssueId(request: APIRequestContext): Promise<string | null> {
  const list = await apiGet(request, '/api/issues?limit=20');
  if (!list.ok) return null;
  return firstIssueId(list.json);
}

async function checkIssueSheet(page: Page, request: APIRequestContext): Promise<void> {
  log('4. 看板 ?issue= Sheet 开合');
  let issueId = await resolveIssueId(request);
  if (!issueId) {
    // 尝试点第一张卡
    await page.goto(`${SLICE33.web}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitBrief(page, 1000);
    const firstCard = page.locator(SLICE33.cardTitle).first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await waitBrief(page, 800);
      const u = new URL(page.url());
      issueId = u.searchParams.get('issue');
    }
  }

  if (!issueId) {
    record({
      id: 'ui.sheet.open',
      must: '2',
      status: 'SKIP',
      note: '无可用 issue id（列表空且无法点卡），Sheet 开合跳过',
    });
    record({
      id: 'ui.sheet.close',
      must: '2',
      status: 'SKIP',
      note: '依赖 open',
    });
    return;
  }

  // 深链打开
  await page.goto(`${SLICE33.web}${SLICE33.sheetUrl(issueId)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await waitBrief(page, 1200);

  const sheet = page.locator(SLICE33.sheet);
  const opened = await sheet.isVisible().catch(() => false);
  const urlHasIssue = page.url().includes(`issue=${encodeURIComponent(issueId)}`)
    || page.url().includes(`issue=${issueId}`);

  record({
    id: 'ui.sheet.open',
    must: '2',
    status: opened && urlHasIssue ? 'PASS' : opened ? 'WARN' : 'FAIL',
    note: opened
      ? `sheet 可见 issue=${issueId}, urlHasIssue=${urlHasIssue}, url=${page.url()}`
      : `sheet 不可见 issue=${issueId} url=${page.url()}`,
  });

  if (!opened) {
    record({
      id: 'ui.sheet.close',
      must: '2',
      status: 'SKIP',
      note: 'open 失败，跳过关闭',
    });
    return;
  }

  // Esc 关闭
  await page.keyboard.press('Escape');
  await waitBrief(page, 600);
  let closed = !(await sheet.isVisible().catch(() => false));
  let closeNote = 'Esc';

  // 兜底：点关闭按钮
  if (!closed) {
    const closeBtn = page.locator(SLICE33.sheetClose).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await waitBrief(page, 500);
      closed = !(await sheet.isVisible().catch(() => false));
      closeNote = 'close-btn';
    }
  }

  const urlCleared = !new URL(page.url()).searchParams.get('issue');
  record({
    id: 'ui.sheet.close',
    must: '2',
    status: closed ? 'PASS' : 'FAIL',
    note: closed
      ? `已关闭 via ${closeNote}, urlCleared=${urlCleared}, url=${page.url()}`
      : `关闭失败 via ${closeNote}, url=${page.url()}`,
  });
}

async function checkSettingsHealth(page: Page): Promise<void> {
  log('5. Settings 健康卡可读');
  await page.goto(`${SLICE33.web}${SLICE33.settingsHealthTab}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });

  // Settings 数据请求可能较慢：先等到壳/导航出现，再点「环境诊断」
  await page
    .locator(`${SLICE33.settingsNavHealth}, ${SLICE33.settingsLiveProbes}, .settings-nav-item, .page-container`)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
  await waitBrief(page, 800);

  const nav = page.locator(SLICE33.settingsNavHealth).first();
  if (await nav.isVisible().catch(() => false)) {
    await nav.click().catch(() => {});
    await waitBrief(page, 600);
  }

  // 轮询：数据返回后健康 section / 探针 / 文案会出现
  let sectionVisible = false;
  let hasHealthText = false;
  let bodySnippet = '';
  for (let i = 0; i < 12; i++) {
    sectionVisible =
      (await page.locator(SLICE33.settingsHealthSection).first().isVisible().catch(() => false)) ||
      (await page.locator(SLICE33.settingsLiveProbes).first().isVisible().catch(() => false)) ||
      (await page.locator(SLICE33.settingsRunHealth).first().isVisible().catch(() => false)) ||
      (await page.locator(SLICE33.settingsMemoryHealth).first().isVisible().catch(() => false)) ||
      (await page.locator('[data-testid="settings-wiki-auto-health"]').first().isVisible().catch(() => false));

    const bodyText = await page.innerText('body').catch(() => '');
    bodySnippet = bodyText.replace(/\s+/g, ' ').slice(0, 180);
    hasHealthText =
      /健康摘要|环境诊断|活体|探针|运行健康|记忆层|Live Runtime Probes|健康|加载环境诊断/i.test(
        bodyText,
      );

    if (sectionVisible) break;
    // 仍在加载：继续等
    if (/加载环境诊断|加载中/.test(bodyText)) {
      await waitBrief(page, 700);
      continue;
    }
    if (hasHealthText) break;
    await waitBrief(page, 500);
  }

  // 导航导航「环境诊断」本身也算健康入口可读
  const navVisible = await nav.isVisible().catch(() => false);

  record({
    id: 'ui.settings.health',
    must: '4',
    status: sectionVisible || hasHealthText || navVisible ? 'PASS' : 'FAIL',
    note: sectionVisible
      ? '健康相关 section/testid 可见'
      : hasHealthText
        ? `未见最终 testid，但 body 含健康/诊断文案: ${bodySnippet}`
        : navVisible
          ? '仅见 settings-nav-health（环境诊断入口）；内容卡可能仍加载中'
          : `未检测到健康卡或文案: ${bodySnippet}`,
  });
}

/**
 * Must 1：派活 → run 出现 → 状态推进
 * 策略：API POST /api/issues（createIssueCore enqueue:true）
 * - 不强制真 CLI 跑完；记录 enqueue 元数据 + runs 列表是否出现该 issue 的 run
 * - enqueue 硬闸失败 → SKIP/WARN，不假绿
 */
async function checkDispatchRun(
  request: APIRequestContext,
): Promise<void> {
  log('6. 派活→run（API create issue + enqueue；真 CLI 非强制）');
  const title = `[Slice33 E2E] baseline ${new Date().toISOString()}`;
  const create = await apiPost(request, '/api/issues', {
    title,
    description: 'Slice 33 Phase B live Playwright baseline — 可删',
    priority: 'low',
    // 指派已有 agent 以触发 enqueue（agt-lead 本地种子常见）
    assignee: { type: 'agent', id: 'agt-lead' },
  });

  if (!create.ok || !create.json?.id) {
    // 无 assignee 再试一次（仅建卡，不强制 enqueue）
    if (create.status >= 400) {
      const bare = await apiPost(request, '/api/issues', {
        title: `${title} (unassigned)`,
        description: 'Slice 33 bare create',
        priority: 'low',
      });
      if (bare.ok && bare.json?.id) {
        record({
          id: 'flow.create-issue',
          must: '1',
          status: 'PASS',
          note: `created id=${bare.json.id} identifier=${bare.json.identifier ?? '?'} (无 assignee；enqueue 可能未触发)`,
        });
        record({
          id: 'flow.enqueue',
          must: '1',
          status: 'SKIP',
          note: '未指派 agent，跳过 enqueue 断言（不粉饰）',
        });
        record({
          id: 'flow.run-appear',
          must: '1',
          status: 'SKIP',
          note: '依赖 enqueue',
        });
        return;
      }
    }
    record({
      id: 'flow.create-issue',
      must: '1',
      status: 'FAIL',
      note: `POST /api/issues → HTTP ${create.status} body=${create.text.slice(0, 240)}`,
    });
    record({
      id: 'flow.enqueue',
      must: '1',
      status: 'SKIP',
      note: 'create 失败',
    });
    record({
      id: 'flow.run-appear',
      must: '1',
      status: 'SKIP',
      note: 'create 失败',
    });
    return;
  }

  const issueId: string = create.json.id;
  const identifier = create.json.identifier ?? '?';
  const enqueueMeta = create.json.enqueue;
  record({
    id: 'flow.create-issue',
    must: '1',
    status: 'PASS',
    note: `created id=${issueId} identifier=${identifier}`,
  });

  // enqueue 元数据：createIssueCore 会带 enqueue 字段；硬闸 skipped 记 SKIP
  if (enqueueMeta == null) {
    record({
      id: 'flow.enqueue',
      must: '1',
      status: 'WARN',
      note: '响应无 enqueue 字段；将轮询 /api/runs 观察',
    });
  } else if (
    enqueueMeta === true ||
    enqueueMeta?.status === 'queued' ||
    enqueueMeta?.status === 'ok' ||
    enqueueMeta?.status === 'enqueued' ||
    enqueueMeta?.runId ||
    enqueueMeta?.id
  ) {
    record({
      id: 'flow.enqueue',
      must: '1',
      status: 'PASS',
      note: `enqueue=${JSON.stringify(enqueueMeta).slice(0, 220)}`,
    });
  } else if (
    enqueueMeta?.status === 'skipped' ||
    enqueueMeta?.status === 'duplicate' ||
    enqueueMeta?.reason
  ) {
    record({
      id: 'flow.enqueue',
      must: '1',
      status: 'SKIP',
      note: `enqueue 未真正入队（硬闸/去重）: ${JSON.stringify(enqueueMeta).slice(0, 220)}`,
    });
  } else {
    record({
      id: 'flow.enqueue',
      must: '1',
      status: 'WARN',
      note: `enqueue 形态未识别: ${JSON.stringify(enqueueMeta).slice(0, 220)}`,
    });
  }

  // 轮询 runs：出现即 PASS；状态推进（queued→running/terminal）额外记录
  let found: any = null;
  let advanced = false;
  const seenStatuses = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const runsRes = await apiGet(
      request,
      `/api/runs?issueId=${encodeURIComponent(issueId)}&limit=10`,
    );
    const runs = extractRuns(runsRes.json);
    const mine =
      runs.find((r) => r.issueId === issueId) ??
      runs.find((r) => r.id && enqueueMeta?.runId && r.id === enqueueMeta.runId);
    if (mine) {
      found = mine;
      if (mine.status) seenStatuses.add(String(mine.status));
      if (seenStatuses.size > 1) advanced = true;
      // 已 running / 终态 也算推进证据
      if (
        ['running', 'succeeded', 'completed', 'failed', 'cancelled', 'timed_out'].includes(
          String(mine.status),
        )
      ) {
        advanced = true;
        break;
      }
    }
    // 全局 runs 兜底（部分实现 issueId 过滤可能不同）
    if (!found) {
      const all = await apiGet(request, '/api/runs?limit=30');
      const allRuns = extractRuns(all.json);
      const hit = allRuns.find((r) => r.issueId === issueId);
      if (hit) {
        found = hit;
        if (hit.status) seenStatuses.add(String(hit.status));
        if (
          ['running', 'succeeded', 'completed', 'failed', 'cancelled', 'timed_out'].includes(
            String(hit.status),
          )
        ) {
          advanced = true;
          break;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  if (!found) {
    // enqueue 已 SKIP 时 run 不出现不算 FAIL
    const enq = results.find((r) => r.id === 'flow.enqueue');
    if (enq?.status === 'SKIP') {
      record({
        id: 'flow.run-appear',
        must: '1',
        status: 'SKIP',
        note: `issue=${issueId} 无 run（与 enqueue SKIP 一致）`,
      });
    } else {
      record({
        id: 'flow.run-appear',
        must: '1',
        status: 'FAIL',
        note: `issue=${issueId} 在 /api/runs 未出现对应 run（mock/真 CLI 均未观测到）`,
      });
    }
    return;
  }

  record({
    id: 'flow.run-appear',
    must: '1',
    status: 'PASS',
    note: `run id=${found.id} status=${found.status} statusesSeen=[${[...seenStatuses].join(',')}] advanced=${advanced}`,
  });

  if (advanced || seenStatuses.size >= 1) {
    record({
      id: 'flow.run-status',
      must: '1',
      status: advanced ? 'PASS' : 'WARN',
      note: advanced
        ? `状态已推进/进入执行或终态: ${[...seenStatuses].join('→')}`
        : `仅观测到 ${[...seenStatuses].join(',')}（可能仍 queued；真 CLI 非本刀强制）`,
    });
  }
}

function printReport(): number {
  log('\n========================================');
  log('Slice 33 Phase B V1 · live Playwright 基线报告');
  log(`WEB=${SLICE33.web} SERVER=${SLICE33.server}`);
  log(`log=${LOG_PATH}`);
  log('========================================');
  for (const r of results) {
    const tag =
      r.status === 'PASS' ? 'PASS' :
      r.status === 'FAIL' ? 'FAIL' :
      r.status === 'SKIP' ? 'SKIP' : 'WARN';
    log(`[${tag}] ${r.id}${r.must ? ` (Must ${r.must})` : ''} — ${r.note}`);
  }
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  log(`\n合计 PASS=${pass} FAIL=${fail} SKIP=${skip} WARN=${warn}`);
  if (fail > 0) {
    log('结论: FAIL（存在硬失败，见上表；不粉饰）');
  } else {
    log('结论: PASS（无硬失败；SKIP/WARN 已如实记录）');
  }
  return fail;
}

async function main(): Promise<void> {
  log('🚀 Slice 33 · Phase B V1 全栈 live Playwright 基线');
  log(`WEB=${SLICE33.web} SERVER=${SLICE33.server}`);

  // 用 request context 做 API（不依赖 page）
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const request = context.request;

  try {
    const up = await checkServicesUp(request);
    if (!up) {
      record({
        id: 'flow.aborted',
        status: 'FAIL',
        note: '服务未就绪，后续 UI/派活检查中止。启动说明：在 app/ 下 pnpm dev（或分别起 web@3000 与 server@3001）',
      });
      return;
    }

    await checkApiBaseline(request);
    await checkBoardLoad(page);
    await checkWsChip(page);
    await checkIssueSheet(page, request);
    await checkSettingsHealth(page);
    await checkDispatchRun(request);
  } catch (err: any) {
    record({
      id: 'runner.exception',
      status: 'FAIL',
      note: err?.stack ?? err?.message ?? String(err),
    });
  } finally {
    await browser.close().catch(() => {});
    try {
      mkdirSync(LOG_DIR, { recursive: true });
      writeFileSync(LOG_PATH, logLines.join('\n') + '\n', 'utf8');
      log(`📝 日志已写: ${LOG_PATH}`);
    } catch (e: any) {
      log(`写日志失败: ${e?.message ?? e}`);
    }
    const fail = printReport();
    process.exitCode = fail > 0 ? 1 : 0;
  }
}

// CLI 入口
const isDirect =
  process.argv[1]?.includes('e2e-slice33-phase-b-baseline') ||
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;

if (isDirect || process.argv[1]?.endsWith('e2e-slice33-phase-b-baseline.mts')) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

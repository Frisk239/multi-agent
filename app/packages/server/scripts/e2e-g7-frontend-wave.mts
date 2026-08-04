/**
 * G7 前端体验第二波 · Playwright 关刀验收
 *
 * 覆盖：G7-1 Sheet 后退关闭 · G7-2 返回不闪屏 · G7-5 Sheet 优先级/标签 ·
 * G7-6 新建表单可搜指派 · G7-7 Inbox Enter 打开 · G7-9 页标题 ·
 * G7-10 Wiki 分享链复制 · G7-12 工具栏收纳 · G7-4 transcript 虚拟化（DB 注入 120 条消息）
 *
 * 前置：web :3000 + api :3001（DB_PATH=./e2e-playwright.db，已 migrate+seed）
 * 运行：cd app/packages/server && pnpm exec tsx scripts/e2e-g7-frontend-wave.mts
 */
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const API = process.env.SERVER ?? 'http://localhost:3001';
const DB_PATH = process.env.DB_PATH ?? './e2e-playwright.db';

const results: { path: string; status: 'PASS' | 'FAIL'; note: string }[] = [];
function check(name: string, ok: boolean, note: string) {
  results.push({ path: name, status: ok ? 'PASS' : 'FAIL', note });
  console.log(`  ${ok ? '✅' : '❌'} ${name} — ${note}`);
}

async function main() {
  console.log('🚀 [G7] 前端体验第二波验收开始…');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();

  try {
    // ── G7-1：看板 → 打开 Sheet → 后退关闭 ──
    console.log('📍 G7-1 Sheet 后退关闭');
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('[data-testid="kanban-board"]', { timeout: 15000 });
    const firstCard = page.locator('[data-testid="issue-card-title-link"]').first();
    const cardCount = await firstCard.count();
    check('G7-1 看板有卡片可点', cardCount > 0, `卡片数 ${cardCount}`);
    if (cardCount > 0) {
      await firstCard.click();
      await page.waitForSelector('[data-testid="issue-side-sheet"]', { timeout: 10000 });
      const sheetVisible = await page.locator('[data-testid="issue-side-sheet"]').isVisible();
      check('G7-1 点击卡片打开 Sheet', sheetVisible, 'sheet 可见');
      // G7-5：Sheet 内优先级 Select + 标签编辑器
      const hasPriority = (await page.locator('[data-testid="issue-sheet-priority"]').count()) > 0;
      const hasLabels = (await page.locator('[data-testid="issue-sheet-labels"] [data-testid="issue-labels-editor"]').count()) > 0
        || (await page.locator('[data-testid="issue-labels-editor"]').count()) > 0;
      check('G7-5 Sheet 优先级 Select 入 Meta', hasPriority, 'issue-sheet-priority 存在');
      check('G7-5 Sheet 标签行内编辑', hasLabels, 'issue-labels-editor 存在');
      // 后退一次 → Sheet 关闭（URL 的 issue= 消失）
      await page.goBack({ waitUntil: 'networkidle' });
      const sheetGone = (await page.locator('[data-testid="issue-side-sheet"]').count()) === 0;
      const urlClean = !(page.url().includes('issue='));
      check('G7-1 Back 一次关闭 Sheet', sheetGone && urlClean, `url=${page.url()}`);
      // G7-2：返回后看板仍在、无 skeleton 闪烁
      await page.waitForSelector('[data-testid="kanban-board"]', { timeout: 10000 });
      const boardBack = (await page.locator('[data-testid="kanban-board"]').count()) > 0
        && (await page.locator('[data-testid="page-skeleton"]').count()) === 0;
      check('G7-2 返回看板不闪屏（无 skeleton）', boardBack, 'kanban-board 直显');
    }

    // ── G7-6：新建表单可搜指派 ──
    console.log('📍 G7-6 新建表单可搜指派');
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('[data-testid="kanban-board"]', { timeout: 15000 });
    const newBtn = page.locator('button', { hasText: '新建 Issue' }).first();
    if (await newBtn.count()) {
      await newBtn.click();
      await page.waitForSelector('[data-testid="new-issue-assignee-search"]', { timeout: 10000 });
      const searchOk = await page.locator('[data-testid="new-issue-assignee-search"]').isVisible();
      const selectOk = (await page.locator('[data-testid="new-issue-assignee"]').count()) > 0;
      check('G7-6 新建表单可搜指派', searchOk && selectOk, '搜索框 + combobox select 存在');
      await page.keyboard.press('Escape');
    } else {
      check('G7-6 新建表单可搜指派', false, '未找到新建按钮');
    }

    // ── G7-12：导入/导出收纳进筛选区 ──
    console.log('📍 G7-12 工具栏收纳');
    const exportBtn = page.locator('[data-testid="kanban-export-json"]');
    const ioContainer = page.locator('[data-testid="kanban-toolbar-io"]');
    const inMoreBefore = ioContainer.count() === 0; // 未展开时 io 容器不可见
    await page.locator('[data-testid="kanban-more-filters"]').click();
    await page.waitForSelector('[data-testid="kanban-toolbar-more"]', { timeout: 10000 });
    const inMoreAfter = (await ioContainer.count()) > 0
      && (await exportBtn.count()) > 0
      && (await exportBtn.isVisible());
    const primaryHasExport = await page.locator('.kanban-toolbar-primary [data-testid="kanban-export-json"]').count();
    check('G7-12 导入/导出收进筛选区', inMoreAfter && primaryHasExport === 0, `primary 内导出按钮 ${primaryHasExport} 个`);

    // ── G7-7：Inbox j/k + Enter 打开 ──
    console.log('📍 G7-7 Inbox 键盘导航');
    // seed 库无 inbox 项 → 直插 3 条（recipient=user-linyuan，带 issueId 供 Enter 深链）
    {
      const idb = new Database(DB_PATH);
      const seedIssue = idb
        .prepare(`SELECT id FROM issue WHERE workspace_id = 'ws-local' LIMIT 1`)
        .get() as { id: string } | undefined;
      if (seedIssue) {
        const t0 = Date.now();
        idb.prepare(
          `INSERT OR IGNORE INTO inbox_item
             (id, workspace_id, recipient_type, recipient_id, type, severity, issue_id, title, body, dedupe_key, read, archived, created_at)
           VALUES (?, 'ws-local', 'member', 'user-linyuan', 'comment', 'info', ?, 'G7 验收评论', '键盘导航验收', ?, 0, 0, ?)`,
        ).run('g7-inbox-1', seedIssue.id, 'comment:g7-inbox-1', t0 - 3000);
        idb.prepare(
          `INSERT OR IGNORE INTO inbox_item
             (id, workspace_id, recipient_type, recipient_id, type, severity, issue_id, title, body, dedupe_key, read, archived, created_at)
           VALUES (?, 'ws-local', 'member', 'user-linyuan', 'assigned', 'attention', ?, 'G7 验收指派', 'Enter 打开验收', ?, 0, 0, ?)`,
        ).run('g7-inbox-2', seedIssue.id, 'assign:g7-inbox-2', t0 - 2000);
        idb.prepare(
          `INSERT OR IGNORE INTO inbox_item
             (id, workspace_id, recipient_type, recipient_id, type, severity, issue_id, title, body, dedupe_key, read, archived, created_at)
           VALUES (?, 'ws-local', 'member', 'user-linyuan', 'run_completed', 'info', ?, 'G7 验收完成', 'Enter 打开验收2', ?, 0, 0, ?)`,
        ).run('g7-inbox-3', seedIssue.id, 'run:g7-inbox-3:completed', t0 - 1000);
      }
      idb.close();
    }
    await page.goto(`${WEB}/inbox`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.inbox-row', { timeout: 15000 });
    const inboxRows = await page.locator('.inbox-row').count();
    check('G7-7 Inbox 有行', inboxRows > 0, `行数 ${inboxRows}`);
    if (inboxRows > 0) {
      await page.keyboard.press('j');
      await page.waitForTimeout(300);
      const activeRow = await page.locator('.inbox-row[data-inbox-active="1"]').count();
      check('G7-7 j 键选中行', activeRow === 1, 'active 行出现');
      const beforeUrl = page.url();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      const afterUrl = page.url();
      const navigated = afterUrl.includes('/issues/') || afterUrl.includes('/runs?');
      check('G7-7 Enter 打开完整目标', navigated, `${beforeUrl} → ${afterUrl}`);
    }

    // ── G7-9：页标题区分 ──
    console.log('📍 G7-9 页标题');
    await page.goto(`${WEB}/runs`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const runsTitle = await page.title();
    check('G7-9 /runs 标题含「运行」', runsTitle.includes('运行'), `title=${runsTitle}`);
    await page.goto(`${WEB}/memory`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const memTitle = await page.title();
    check('G7-9 /memory 标题为「记忆」', memTitle.includes('记忆'), `title=${memTitle}`);

    // ── G7-3：Memory 页列表活性（行渲染 + 无错误行） ──
    console.log('📍 G7-3 Memory 页');
    // 播种一条 curated 记忆（seed 库为空，列表会停在空态行）
    await fetch(`${API}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'G7 e2e memory', scope: 'workspace' }),
    });
    await page.goto(`${WEB}/memory`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('[data-testid="memory-table"]', { timeout: 15000 });
    await page.waitForTimeout(500);
    const memRows = await page.locator('[data-testid="memory-table"] tbody tr[data-memory-id]').count();
    check('G7-3 Memory 表格渲染（有数据行）', memRows > 0, `数据行数 ${memRows}`);
    const memError = await page.locator('[data-testid="memory-table"] .error-state').count();
    check('G7-3 Memory 无错误行', memError === 0, `error-state 行 ${memError}`);

    // ── G7-10：Wiki 分享链复制 ──
    console.log('📍 G7-10 Wiki 分享链');
    const wikiRes = await fetch(`${API}/api/wiki/pages`);
    const wikiPages = ((await wikiRes.json()) as { data: { slug: string }[] }).data ?? [];
    const wikiSlug = wikiPages[0]?.slug;
    if (!wikiSlug) {
      check('G7-10 分享链复制反馈', false, 'wiki 无页面');
    } else {
      await page.goto(`${WEB}/wiki?slug=${encodeURIComponent(wikiSlug)}`, { waitUntil: 'networkidle', timeout: 30000 });
      const shareBtn = page.locator('[data-testid="wiki-copy-slug-link"]').first();
      await shareBtn.waitFor({ timeout: 15000 });
      await shareBtn.click();
      await page.waitForFunction(
        () => document.querySelector('[data-testid="wiki-copy-slug-link"]')?.textContent?.includes('已复制'),
        { timeout: 5000 },
      );
      const copied = (await shareBtn.textContent())?.includes('已复制') ?? false;
      check('G7-10 分享链复制反馈', copied, '按钮文案 → 已复制');
    }

    // ── G7-4：transcript 虚拟化（注入 120 条消息的 run） ──
    console.log('📍 G7-4 transcript 虚拟化');
    const db = new Database(DB_PATH);
    const runId = `g7-virt-${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_run (id, agent_id, runtime, status, kind, priority, is_leader, session_poisoned, attempt, max_attempts, created_at)
       VALUES (?, 'agent-seed-1', 'grok', 'completed', 'issue', 'medium', 0, 0, 1, 2, ?)`,
    ).run(runId, now);
    const insMsg = db.prepare(
      `INSERT INTO run_message (id, run_id, seq, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const txn = db.transaction(() => {
      for (let i = 0; i < 120; i++) {
        insMsg.run(
          `m-${runId}-${i}`,
          runId,
          i + 1,
          i % 3 === 0 ? 'assistant' : 'system',
          `G7 虚拟化验收消息 #${i}：${'内容 '.repeat(4)}`,
          now + i * 1000,
        );
      }
    });
    txn();
    db.close();
    await page.goto(`${WEB}/runs/${runId}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('[data-testid="run-detail-events"]', { timeout: 15000 });
    const virtualized = (await page.locator('[data-testid="run-detail-events"]').getAttribute('data-virtualized')) === '1';
    const total = Number(await page.locator('[data-testid="run-detail-events"]').getAttribute('data-virtual-count'));
    const rendered = Number(await page.locator('[data-testid="run-detail-events"]').getAttribute('data-virtual-rendered'));
    const viewport = (await page.locator('[data-testid="run-transcript-viewport"]').count()) > 0;
    check(
      'G7-4 长 run 窗口化渲染',
      virtualized && viewport && total === 120 && rendered > 0 && rendered < total,
      `virtualized=${virtualized} total=${total} rendered=${rendered} viewport=${viewport}`,
    );
    // 展开一个长消息行 → 虚拟列表仍工作（toggle 存在）
    const toggle = page.locator('[data-testid="run-detail-tool-pair-toggle"], .run-transcript-toggle').first();
    if (await toggle.count()) {
      await toggle.click();
      await page.waitForTimeout(300);
      check('G7-4 虚拟列表内展开交互', true, 'toggle 可点击');
    }
  } catch (e) {
    console.error('❌ 脚本异常:', e);
    results.push({ path: 'SCRIPT', status: 'FAIL', note: String(e) });
  } finally {
    await browser.close();
  }

  const fails = results.filter((r) => r.status === 'FAIL');
  console.log(`\n==== G7 验收汇总：PASS ${results.length - fails.length}/${results.length} ====`);
  for (const r of results) console.log(`  [${r.status}] ${r.path} — ${r.note}`);
  process.exit(fails.length > 0 ? 1 : 0);
}

void main();

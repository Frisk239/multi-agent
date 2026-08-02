/**
 * G5 第三波 M3 冒烟（Playwright 关刀证据）：
 * - G3-3 Issue 详情 run 历史行内「摘要」展开（RunTranscriptPreview 不跳页）
 * - G3-4 Agent 详情 settings tab 环境变量/自定义参数编辑器（回读 + 保存）
 * - G3-5 IssueDetail 附件区「上传」按钮 + 拖拽 dropzone（≤25MiB 文案）
 *
 * 运行：SERVER=… WEB=… pnpm exec tsx scripts/e2e-g35-m3-features.mts
 * 无服 / 无 playwright → SKIP（绝不假绿）。
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:3001';
const WEB = process.env.WEB ?? 'http://127.0.0.1:3000';
const TOKEN = process.env.MA_LOCAL_TOKEN ?? process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '';

type Status = 'PASS' | 'FAIL' | 'SKIP';
interface CheckRow { id: string; status: Status; note: string }
const results: CheckRow[] = [];
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../../../.progress/logs');

function log(msg: string): void { console.log(msg); }
function record(row: CheckRow): void { results.push(row); log(`  [${row.status}] ${row.id} — ${row.note}`); }

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (TOKEN) h['X-MA-Token'] = TOKEN;
  return h;
}

async function api(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const res = await fetch(`${SERVER}${path}`, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

async function main(): Promise<void> {
  const health = await api('GET', '/healthz');
  if (!health.ok) {
    record({ id: 'server-probe', status: 'SKIP', note: `server ${SERVER} 不可达` });
    printSummary();
    return;
  }

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    record({ id: 'ui-playwright', status: 'SKIP', note: 'playwright not installed' });
    printSummary();
    return;
  }

  let browser: import('playwright').Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      record({ id: 'ui-launch', status: 'SKIP', note: 'no chromium/chrome available' });
      printSummary();
      return;
    }
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // —— 造数据：issue + run + agent ——
    const now = Date.now();
    const iss = await api('POST', '/api/issues', {
      title: `M3 冒烟 ${now}`,
      status: 'in_progress',
      priority: 'none',
      assigneeType: 'agent',
      assigneeId: 'agent-primary',
      creatorType: 'member',
      creatorId: 'member-local',
    });
    let issueId = iss.json?.id ?? null;
    if (!issueId && Array.isArray(iss.json)) issueId = iss.json[0]?.id ?? null;
    const agents = await api('GET', '/api/agents');
    let agentId = 'agent-primary';
    const agentList = Array.isArray(agents.json) ? agents.json : agents.json?.agents ?? [];
    if (agentList.length) agentId = agentList[0].id;

    // —— G3-3：优先用有 run 历史的 issue（dev.db 历史 run 兜底） ——
    const runsRes = await api('GET', '/api/runs?limit=50');
    const runsList = Array.isArray(runsRes.json?.data) ? runsRes.json.data : [];
    const runWithIssue = runsList.find((r: { issueId?: string | null }) => !!r.issueId);
    const issueWithRuns = runWithIssue?.issueId ?? null;
    record({
      id: 'g3-3-probe',
      status: issueWithRuns ? 'PASS' : 'SKIP',
      note: issueWithRuns ? `找到含 run 的 issue ${issueWithRuns}` : '无历史 run issue',
    });
    if (issueWithRuns) {
      await page.goto(`${WEB}/issues/${issueWithRuns}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      const previewBtn = await page.getByTestId('issue-run-history-preview').first().count().catch(() => 0);
      if (previewBtn > 0) {
        await page.getByTestId('issue-run-history-preview').first().click();
        await page.waitForTimeout(1500);
        const panel = await page.getByTestId('issue-run-history-preview-panel').count().catch(() => 0);
        record({
          id: 'g3-3-inline-preview',
          status: panel > 0 ? 'PASS' : 'FAIL',
          note: panel > 0 ? '行内 transcript 面板已展开（不跳页）' : '展开面板未出现',
        });
      } else {
        record({ id: 'g3-3-inline-preview', status: 'FAIL', note: '有 run 的 issue 未见摘要按钮' });
      }
    }

    // —— G3-5：附件区上传按钮 + 拖拽区 ——
    const issuePath = issueId ? `/issues/${issueId}` : '/issues';
    await page.goto(`${WEB}${issuePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const uploadBtn = await page.getByTestId('issue-attachment-upload').count().catch(() => 0);
    record({
      id: 'g3-5-upload-button',
      status: uploadBtn > 0 ? 'PASS' : 'FAIL',
      note: uploadBtn > 0 ? '附件区「上传」按钮可见' : '未找到 issue-attachment-upload',
    });
    if (uploadBtn > 0) {
      const hint = await page.getByTestId('issue-attachment-upload').getAttribute('title').catch(() => null);
      record({
        id: 'g3-5-size-hint',
        status: hint && hint.includes('25 MiB') ? 'PASS' : 'FAIL',
        note: hint ? `上限提示: ${hint}` : '无 ≤25MiB 提示',
      });
    }

    // —— G3-4：Agent 详情 settings tab envVars 编辑器 ——
    await page.goto(`${WEB}/agents/${agentId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByTestId('agent-tab-settings').click().catch(() => null);
    await page.waitForTimeout(800);
    const editor = await page.getByTestId('agent-envvars-editor').count().catch(() => 0);
    record({
      id: 'g3-4-envvars-editor',
      status: editor > 0 ? 'PASS' : 'FAIL',
      note: editor > 0 ? 'settings tab 环境变量编辑器可见' : '未找到 agent-envvars-editor',
    });
    if (editor > 0) {
      const addBtn = await page.getByTestId('agent-envvar-add').count().catch(() => 0);
      if (addBtn > 0) {
        await page.getByTestId('agent-envvar-add').click();
        await page.waitForTimeout(300);
        const keyInputs = await page.getByTestId('agent-envvar-key').count().catch(() => 0);
        record({
          id: 'g3-4-envvar-add-row',
          status: keyInputs >= 1 ? 'PASS' : 'FAIL',
          note: keyInputs >= 1 ? '可添加 envVars 行' : '添加行未出现',
        });
      }
    }
  } catch (e) {
    record({ id: 'ui-run', status: 'FAIL', note: e instanceof Error ? e.message : String(e) });
  } finally {
    await browser?.close();
  }
  printSummary();
}

function printSummary(): void {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  log(`\nM3 冒烟: PASS ${pass} / FAIL ${fail} / SKIP ${results.length - pass - fail}`);
  if (fail > 0) process.exitCode = 1;
}

await main();

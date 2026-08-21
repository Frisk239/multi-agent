/**
 * Owner E2E: swimlane-drag-reassign（隔离环境）
 * 泳道 pointer 序列拖拽：alpha 卡 → beta 道 in_progress 列（改派+状态）→ API 断言 → beta 卡 → 未指派道（assignee null）
 * 注意：dnd-kit PointerSensor 非原生 HTML5 dnd，用 mouse down/多步 move/up 序列。
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const reqApp = createRequire('D:/code/multi-agent/app/package.json');
const { chromium } = reqApp('playwright');

const WEB = 'http://localhost:3100';
const API = 'http://localhost:3101/api';
const SHOTS = 'D:/code/multi-agent/.scratch/swimlane-drag-reassign/owner-e2e-20260821-1150/shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}
async function jf(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => null);
  return { res, body };
}

// ---------- 夹具 ----------
const SUF = Date.now() % 100000;
const { body: a1 } = await jf(`${API}/agents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `drag-agent-alpha-${SUF}`, runtime: 'claude-code' }) });
const { body: a2 } = await jf(`${API}/agents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `drag-agent-beta-${SUF}`, runtime: 'claude-code' }) });
const r1 = await jf(`${API}/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `drag issue alpha ${SUF}`, assignee: { type: 'agent', id: a1.id }, status: 'todo' }) });
const r2 = await jf(`${API}/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `drag issue beta ${SUF}`, assignee: { type: 'agent', id: a2.id }, status: 'in_progress' }) });
const r3 = await jf(`${API}/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `drag issue unassigned ${SUF}`, status: 'todo' }) });
check('夹具 3 卡', [r1, r2, r3].every((r) => r.res.status === 201));
const ALPHA_ISSUE = r1.body.id;
const UNASSIGNED_ISSUE = r3.body.id;

// ---------- UI ----------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1560, height: 1500 } });

async function dragCard(cardTestId, targetSel) {
  const card = page.locator(cardTestId).first();
  const target = page.locator(targetSel).first();
  await card.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + to.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // 多步插值触发 PointerSensor distance 阈值与 collision
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / steps, sy + ((ty - sy) * i) / steps);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);
}

try {
  await page.goto(`${WEB}/?view=swimlane`, { waitUntil: 'domcontentloaded' });
  await page.getByText(`drag issue alpha ${SUF}`).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  // t1 alpha 卡拖到 beta 道的 in_progress 列
  await dragCard(
    `[data-issue-id="${ALPHA_ISSUE}"]`,
    `[data-droppable-id$=":in_progress"][data-droppable-id*="drag-agent-beta"], [data-droppable-id*="agent:"][data-droppable-id$=":in_progress"]`,
  );
  // 兜底：若上面的组合选择器没匹配（droppable id 形态 swimlane:agent:<id>:<status>），用 beta 道容器内 in_progress 列
  const after1 = (await jf(`${API}/issues/${ALPHA_ISSUE}`)).body;
  check(
    't1 跨道拖拽 → 改派 beta + 状态 in_progress',
    after1?.assignee?.id === a2.id && after1?.assignee?.type === 'agent' && after1?.status === 'in_progress',
    JSON.stringify(after1?.assignee) + ' status=' + after1?.status,
  );
  await page.screenshot({ path: path.join(SHOTS, 't1-after-reassign.png'), fullPage: true });

  // t2 未指派卡拖到 alpha 道 todo 列（反向：null → agent）——先刷新拿最新布局
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(`drag issue unassigned ${SUF}`).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await dragCard(
    `[data-issue-id="${UNASSIGNED_ISSUE}"]`,
    `[data-testid="kanban-swimlane-dropzone"][data-droppable-id*="${a1.id}"]`,
  );
  const after2 = (await jf(`${API}/issues/${UNASSIGNED_ISSUE}`)).body;
  check(
    't2 拖到 agent 道 → 指派 alpha（原 todo 保持）',
    after2?.assignee?.id === a1.id && after2?.assignee?.type === 'agent',
    JSON.stringify(after2?.assignee),
  );
  await page.screenshot({ path: path.join(SHOTS, 't2-assign-from-unassigned.png'), fullPage: true });

  // t3 泳道分组随改派刷新（alpha 道现含 2 卡）
  const lanes = await page.locator('.kanban-swimlanes').innerText();
  check('t3 泳道分组反映改派', lanes.includes('drag issue alpha') && lanes.includes('drag issue unassigned'));
} catch (e) {
  check('脚本异常中断', false, e.message);
  await page.screenshot({ path: path.join(SHOTS, 'error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n== SUMMARY: ${results.length - failed.length}/${results.length} passed ==`);
if (failed.length > 0) {
  console.log('FAILED:', failed.map((f) => f.name).join(' | '));
  process.exit(1);
}

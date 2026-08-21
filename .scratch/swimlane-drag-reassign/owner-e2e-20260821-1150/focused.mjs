/**
 * 聚焦诊断：泳道空道 zone 拖拽（干净 DB，一次跑完不重复）
 * 1 夹具（2 agent + 3 卡） 2 泳道拖 alpha 卡→beta 列（t1 路径） 3 拖 unassigned 卡→alpha 空 zone（悬停读 is-over → up → API 断言）
 */
import { createRequire } from 'node:module';
const req = createRequire('D:/code/multi-agent/app/package.json');
const { chromium } = req('playwright');

const API = 'http://localhost:3101/api';
const jf = async (url, opts) => {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => null);
  return { res, body };
};
const post = (url, body) => jf(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const SUF = Date.now() % 100000;

const a1 = (await post(`${API}/agents`, { name: `dg-alpha-${SUF}`, runtime: 'claude-code' })).body;
const a2 = (await post(`${API}/agents`, { name: `dg-beta-${SUF}`, runtime: 'claude-code' })).body;
const iA = (await post(`${API}/issues`, { title: `dg alpha ${SUF}`, assignee: { type: 'agent', id: a1.id }, status: 'todo' })).body;
await post(`${API}/issues`, { title: `dg beta ${SUF}`, assignee: { type: 'agent', id: a2.id }, status: 'in_progress' });
const iU = (await post(`${API}/issues`, { title: `dg unassigned ${SUF}`, status: 'todo' })).body;
console.log('fixtures ok', a1.id.slice(0, 8), a2.id.slice(0, 8));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1560, height: 1500 } });
page.on('console', (m) => { if (m.text().includes('[diag]')) console.log('PAGE:', m.text()); });
await page.goto('http://localhost:3100/?view=swimlane', { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="kanban-swimlanes"]').waitFor({ timeout: 20000 });
await page.waitForTimeout(1000);

async function dragTo(cardId, targetLoc) {
  const card = page
    .locator('[data-testid="kanban-swimlanes"] [data-issue-id="${cardId}"]'.replace('${cardId}', cardId))
    .first();
  const target = page.locator(targetLoc).first();
  await card.waitFor({ state: 'visible', timeout: 25000 });
  await target.waitFor({ state: 'visible', timeout: 25000 });
  await card.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(
      from.x + from.width / 2 + ((to.x + to.width / 2 - from.x - from.width / 2) * i) / 14,
      from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 14,
    );
    await page.waitForTimeout(50);
  }
  await page.screenshot({ path: `D:/code/multi-agent/.scratch/swimlane-drag-reassign/owner-e2e-20260821-1150/shots/mid-drag-${cardId.slice(0,6)}.png` });
  // 悬停读 is-over（collision 命中直接证据）
  const overState = await target.evaluate((el) => el.className);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  return overState;
}

const t1Target = await dragTo(iA.id, `[data-droppable-id$=":in_progress"][data-droppable-id*="${a2.id}"]`);
const after1 = (await jf(`${API}/issues/${iA.id}`)).body;
console.log('T1', after1.assignee?.id === a2.id && after1.status === 'in_progress' ? 'PASS' : 'FAIL',
  JSON.stringify(after1.assignee), after1.status, '| targetClass:', t1Target.slice(0, 60));

// t2：reload 后拖 unassigned 卡到 alpha 空道 zone
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const zoneCount = await page.locator('[data-testid="kanban-swimlane-dropzone"]').count();
const zoneIds = await page.locator('[data-testid="kanban-swimlane-dropzone"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-droppable-id')));
console.log('ZONES', zoneCount, JSON.stringify(zoneIds));
const t2Target = await dragTo(iU.id, `[data-testid="kanban-swimlane-dropzone"][data-droppable-id*="${a1.id}"]`);
const after2 = (await jf(`${API}/issues/${iU.id}`)).body;
console.log('T2', after2.assignee?.id === a1.id ? 'PASS' : 'FAIL',
  JSON.stringify(after2.assignee), after2.status, '| targetClass:', t2Target.slice(0, 60));

await page.screenshot({ path: 'D:/code/multi-agent/.scratch/swimlane-drag-reassign/owner-e2e-20260821-1150/shots/final.png', fullPage: true });
await browser.close();
process.exit(0);

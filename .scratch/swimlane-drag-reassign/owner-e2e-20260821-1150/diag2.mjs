import { createRequire } from 'node:module';
const req = createRequire('D:/code/multi-agent/app/package.json');
const { chromium } = req('playwright');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1560, height: 1500 } });
p.on('response', (r) => { if (r.url().includes('bulk-assign')) console.log('BULK:', r.status(), r.request().method(), r.url().slice(0, 60)); });
 p.on('console', (m) => console.log('PAGE:', m.type(), m.text().slice(0, 120)));
await p.goto('http://localhost:3100/?view=swimlane', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
const unCard = p.locator('[data-issue-id]').filter({ hasText: 'drag issue unassigned' }).first();
await unCard.scrollIntoViewIfNeeded();
const zone = p.locator('[data-testid="kanban-swimlane-dropzone"]').first();
await zone.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
const from = await unCard.boundingBox();
const to = await zone.boundingBox();
console.log('FROM', JSON.stringify(from), 'TO', JSON.stringify(to));
await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await p.mouse.down();
for (let i = 1; i <= 12; i++) {
  await p.mouse.move(from.x + from.width / 2 + ((to.x + to.width / 2 - from.x - from.width / 2) * i) / 12, from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 12);
  await p.waitForTimeout(40);
}
await p.mouse.up();
await p.waitForTimeout(1500);
await b.close();
process.exit(0);

/**
 * DS2：看板手动排序 — reorder API + list sort
 * Run: pnpm exec tsx scripts/test-ds2-reorder.mts  (from packages/server)
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';

const scratch = join(tmpdir(), `ma-ds2-reorder-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
const dbPath = join(scratch, 'ds2.db');
process.env.DB_PATH = dbPath;

const { db, sqlite } = await import('../src/db/client.js');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const { issues, workspaces } = await import('../src/db/schema.js');
const { issueRoutes } = await import('../src/routes/issues.js');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const WS = 'ws-local';
const now = Date.now();
const existing = db.select().from(workspaces).all();
if (existing.length === 0) {
  db.insert(workspaces)
    .values({
      id: WS,
      name: 'local',
      description: null,
      rootPath: scratch,
      createdAt: now,
    })
    .run();
}

const mkIssue = (
  id: string,
  identifier: string,
  status: 'todo' | 'in_progress',
  position: number,
  title: string,
) => {
  db.insert(issues)
    .values({
      id,
      workspaceId: WS,
      identifier,
      title,
      description: null,
      status,
      priority: 'none',
      assigneeType: null,
      assigneeId: null,
      creatorType: 'member',
      creatorId: 'member-local',
      position,
      createdAt: now + position,
      updatedAt: now + position * 10,
    })
    .run();
};

mkIssue('iss-a', 'FRI-A', 'todo', 0, 'A first');
mkIssue('iss-b', 'FRI-B', 'todo', 1, 'B second');
mkIssue('iss-c', 'FRI-C', 'todo', 2, 'C third');
mkIssue('iss-d', 'FRI-D', 'in_progress', 0, 'D other col');

const app = Fastify({ logger: false });
await app.register(issueRoutes);
await app.ready();

// 同列：A B C → B A C
{
  const res = await app.inject({
    method: 'POST',
    url: '/api/issues/reorder',
    payload: { status: 'todo', orderedIds: ['iss-b', 'iss-a', 'iss-c'] },
  });
  assert(res.statusCode === 200, `reorder status ${res.statusCode} ${res.body}`);
  const body = res.json() as Array<{ id: string; position: number; status: string }>;
  assert(body.length === 3, 'reorder returns 3');
  const byId = Object.fromEntries(body.map((i) => [i.id, i]));
  assert(byId['iss-b']?.position === 0, 'b pos0');
  assert(byId['iss-a']?.position === 1, 'a pos1');
  assert(byId['iss-c']?.position === 2, 'c pos2');
  assert(byId['iss-b']?.status === 'todo', 'still todo');
  console.log('PASS same-column reorder B A C');
}

// list default = manual position
{
  const res = await app.inject({ method: 'GET', url: '/api/issues?status=todo' });
  assert(res.statusCode === 200, `list ${res.statusCode}`);
  const body = res.json() as Array<{ id: string; position: number }>;
  const todo = body.filter((i) => ['iss-a', 'iss-b', 'iss-c'].includes(i.id));
  assert(
    todo.map((i) => i.id).join(',') === 'iss-b,iss-a,iss-c',
    `manual order ${todo.map((i) => i.id)}`,
  );
  console.log('PASS GET list default manual order');
}

// list sort=updated
{
  db.update(issues)
    .set({ updatedAt: Date.now() + 999999 })
    .where(eq(issues.id, 'iss-a'))
    .run();
  const res = await app.inject({
    method: 'GET',
    url: '/api/issues?status=todo&sort=updated',
  });
  assert(res.statusCode === 200, `list updated ${res.statusCode}`);
  const body = res.json() as Array<{ id: string }>;
  const todo = body.filter((i) => ['iss-a', 'iss-b', 'iss-c'].includes(i.id));
  assert(todo[0]?.id === 'iss-a', `updated first ${todo.map((i) => i.id)}`);
  console.log('PASS GET list sort=updated');
}

// 跨列：把 D 插入 todo 列顶（orderedIds 全量）
{
  const res = await app.inject({
    method: 'POST',
    url: '/api/issues/reorder',
    payload: {
      status: 'todo',
      orderedIds: ['iss-d', 'iss-b', 'iss-a', 'iss-c'],
    },
  });
  assert(res.statusCode === 200, `cross ${res.statusCode} ${res.body}`);
  const body = res.json() as Array<{ id: string; position: number; status: string }>;
  const d = body.find((i) => i.id === 'iss-d');
  assert(d?.status === 'todo', 'd moved to todo');
  assert(d?.position === 0, 'd at top');
  console.log('PASS cross-column reorder into todo');
}

// PUT status 无 position → 列顶
{
  const res = await app.inject({
    method: 'PUT',
    url: '/api/issues/iss-c',
    payload: { status: 'in_progress' },
  });
  assert(res.statusCode === 200, `put status ${res.statusCode} ${res.body}`);
  const body = res.json() as { id: string; status: string; position: number };
  assert(body.status === 'in_progress', 'status');
  const list = await app.inject({ method: 'GET', url: '/api/issues?status=in_progress' });
  const rows = list.json() as Array<{ id: string; position: number }>;
  const c = rows.find((i) => i.id === 'iss-c');
  assert(c, 'c in progress');
  const minPos = Math.min(...rows.map((r) => r.position));
  assert(c!.position === minPos, `c at top pos=${c!.position} min=${minPos}`);
  console.log('PASS PUT status → column top position');
}

// bad id
{
  const res = await app.inject({
    method: 'POST',
    url: '/api/issues/reorder',
    payload: { status: 'todo', orderedIds: ['no-such'] },
  });
  assert(res.statusCode === 404, `missing id ${res.statusCode}`);
  console.log('PASS reorder missing id 404');
}

await app.close();
sqlite.close();
rmSync(scratch, { recursive: true, force: true });
console.log('ALL PASS DS2 reorder');
process.exit(0);

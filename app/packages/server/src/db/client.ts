import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const DB_PATH = process.env.DB_PATH ?? './dev.db';

export const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// —— label map（spec §4.2 R2）：静态 seed 数据，启动时加载到内存，O(1) 查询 ——
// agent/squad 表的 id -> name 映射，用于 GET issues 时填充 assignee.label
export function resolveAssigneeLabel(
  type: 'member' | 'agent' | 'squad' | null,
  id: string | null,
): string | null {
  if (!type || !id) return null;
  if (type === 'member') {
    const u = db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
    return u?.name ?? '未知成员';
  }
  if (type === 'agent') {
    const a = db.query.agents.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
    return a?.name ?? '未知智能体';
  }
  // squad
  const s = db.query.squads.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
  return s?.name ?? '未知小队';
}

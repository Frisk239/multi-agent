import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const DB_PATH = process.env.DB_PATH ?? './dev.db';

export const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

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

export function resolveAuthorLabel(
  type: 'member' | 'agent',
  id: string,
): string {
  // A2 修复（审计）：熔断 system comment（authorId='system'）短路返回"系统"，
  // 否则 users 表无此行，fallback 返回原始 id 'system'。
  if (type === 'member' && id === 'system') return '系统';
  if (type === 'member') {
    const u = db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
    return u?.name ?? id;
  }
  const a = db.query.agents.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
  return a?.name ?? id;
}

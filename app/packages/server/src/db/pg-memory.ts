// S10：记忆专用 PostgreSQL 连接（与 SQLite 任务库分离，spec V2）
import pg from 'pg';

let pool: pg.Pool | null = null;

export function getMemoryDatabaseUrl(): string | undefined {
  const u = process.env.MEMORY_DATABASE_URL;
  return u && u.length > 0 ? u : undefined;
}

export function getMemoryPgPool(): pg.Pool {
  if (pool) return pool;
  const url = getMemoryDatabaseUrl();
  if (!url) throw new Error('MEMORY_DATABASE_URL 未配置');
  pool = new pg.Pool({ connectionString: url, max: 5 });
  return pool;
}

export async function memoryPgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getMemoryPgPool().query<T>(text, params);
}

export async function closeMemoryPgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

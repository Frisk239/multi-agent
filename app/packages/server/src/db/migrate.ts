import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from './client.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// drizzle-kit generate 产出 ./drizzle/*.sql，此脚本执行它们
// 注意：用 fileURLToPath 而非 .pathname，避免 Windows 上 pathname 产生前导 '/' (/D:/...) 导致路径无效
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
if (!existsSync(migrationsFolder)) {
  console.error(`迁移目录不存在: ${migrationsFolder}，请先跑 pnpm --filter @ma/server db:generate`);
  process.exit(1);
}

migrate(db, { migrationsFolder });
sqlite.close();
console.log('✓ 迁移完成');

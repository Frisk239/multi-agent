/**
 * D2+D4（reopenable-db-lifecycle）：maintenance 模式下原子换库的编排入口。
 *
 * 流程（调用方须已进入 maintenance 模式，写已阻断——本函数不自行开关）：
 *   1. D4：abort 在途子进程 + DB 行终态化（DB 行即锁；executeRun 的终态复核
 *      会拒绝伪完成，残留消息写入由 FK 挡住）
 *   2. D2：stop 两个 worker（不再 claim / 不再派发）
 *   3. D1：swapDatabase（关旧连接 → 开新连接 → drizzle 重建，live binding 生效）
 *   4. 重启 worker
 */
import { and, inArray } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { db, swapDatabase } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { abortRun, listActiveRunIds } from './run-control.js';
import { startRunWorker, stopRunWorker } from './run-worker.js';
import { startAutomationWorker, stopAutomationWorker } from './automation-worker.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * D5：对换入的 DB 文件跑 drizzle migrator（独立连接；journal 保证只跑增量）。
 * 换入前必须完成——旧库 schema 可能落后于当前代码。
 */
export function migrateDatabaseFile(path: string): { ok: true } | { ok: false; error: string } {
  const conn = new Database(path);
  try {
    drizzleMigrate(drizzle(conn, { schema }), { migrationsFolder });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    conn.close();
  }
}

/** D4：终止在途 run —— 先 abort 子进程树，再条件 UPDATE 终态化（只命中 active 状态）。 */
export function terminalizeActiveRuns(
  reason = 'DB 换入：在途 run 已终止（reopenable-db-lifecycle）',
): number {
  for (const id of listActiveRunIds()) abortRun(id);
  const now = Date.now();
  const info = db
    .update(agentRuns)
    .set({ status: 'failed', finishedAt: now, error: reason })
    .where(
      and(
        inArray(agentRuns.status, ['queued', 'waiting_local_directory', 'running']),
      ),
    )
    .run();
  return Number(info.changes ?? 0);
}

export type SwapOutcome = {
  ok: boolean;
  closed: boolean;
  terminatedRuns: number;
  error?: string;
};

/**
 * D2+D1：维护模式下原子换库。停 worker → 换库 → 起 worker（finally 保证恢复）。
 * 失败时 closed=false 且 worker 已恢复——调用方（restore 流程）据此决定回滚或重启兜底。
 */
export function swapDatabaseUnderMaintenance(newPath: string): SwapOutcome {
  const terminatedRuns = terminalizeActiveRuns();
  stopRunWorker();
  stopAutomationWorker();
  try {
    const r = swapDatabase(newPath);
    return { ok: r.closed, closed: r.closed, terminatedRuns };
  } catch (e) {
    return {
      ok: false,
      closed: false,
      terminatedRuns,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    startRunWorker();
    startAutomationWorker();
  }
}

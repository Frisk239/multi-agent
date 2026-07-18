import { buildApp } from './app.js';
import { startRunWorker } from './orchestration/run-worker.js';
import {
  recoverStuckRuns,
  startStaleRunSweeper,
} from './orchestration/stale-runs.js';
import { startAutomationWorker } from './orchestration/automation-worker.js';
import { scanSkills } from './skill/scanner.js';
import { ensureWikiDir } from './wiki/store.js';
import { startWikiIngestWorker } from './wiki/ingest-worker.js';
import { memoryManager } from './memory/manager.js';
import { SqliteTextProvider } from './memory/sqlite-text-provider.js';
import { PgvectorProvider } from './memory/pgvector-provider.js';

const PORT = Number(process.env.PORT ?? 3001);

// S10：MEMORY_PROVIDER 选择；pgvector 失败回退 sqlite-text（R11：先 initialize 再 isAvailable）
async function initMemoryProvider(): Promise<void> {
  const mode = (process.env.MEMORY_PROVIDER ?? 'sqlite-text').toLowerCase();
  if (mode === 'pgvector') {
    const p = new PgvectorProvider();
    try {
      await p.initialize();
      if (p.isAvailable()) {
        memoryManager.setExternal(p);
        console.log('[memory] provider=pgvector');
        return;
      }
      console.warn('[memory] pgvector unavailable, fallback sqlite-text');
    } catch (e) {
      console.warn('[memory] pgvector init failed, fallback sqlite-text:', e);
    }
  }
  memoryManager.setExternal(new SqliteTextProvider());
  console.log('[memory] provider=sqlite-text');
}

async function main() {
  // S05：启动时扫 skill 目录建内存索引（spec §5.2，照 hermes 零足迹，不进 DB）
  scanSkills();
  // S06：确保 wiki/ 目录 + 初始 index.md/log.md 存在（spec §3.7）
  ensureWikiDir();
  // S10：MemoryProvider 选择 + 回退（spec V6/V7）
  await initMemoryProvider();
  await memoryManager.initialize();
  const app = await buildApp();
  // bu01：先收尸残留 running + 卡死 queued，再起 worker + stale sweeper
  recoverStuckRuns();
  // 启动 RunWorker 轮询（spec §6.2）：listen 前启动，enqueue 时 wake 立即触发
  startRunWorker();
  startStaleRunSweeper();
  // bu05：自动化 schedule tick（30s）
  startAutomationWorker();
  // S08：Wiki ingest 队列 worker（spec §4.4）
  startWikiIngestWorker();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`✓ server 起在 http://localhost:${PORT} (ws: /ws)`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

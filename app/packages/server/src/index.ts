// 最先加载本地 .env（WIKI_LLM_* 等；文件 gitignore，见 .env.example）
import { loadLocalEnv } from './load-env.js';
loadLocalEnv();

import { buildApp } from './app.js';
import { startRunWorker } from './orchestration/run-worker.js';
import {
  recoverStuckRuns,
  startStaleRunSweeper,
} from './orchestration/stale-runs.js';
import { startAutomationWorker } from './orchestration/automation-worker.js';
import {
  DEFAULT_HARD_EXIT_MS,
  DEFAULT_SHUTDOWN_GRACE_MS,
  shutdownServer,
} from './orchestration/graceful-shutdown.js';
import { scanSkills } from './skill/scanner.js';
import { ensureWikiDir } from './wiki/store.js';
import { startWikiIngestWorker } from './wiki/ingest-worker.js';
import { memoryManager } from './memory/manager.js';
import { SqliteTextProvider } from './memory/sqlite-text-provider.js';
import { PgvectorProvider } from './memory/pgvector-provider.js';

import { resolveListenHost } from './bind.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = resolveListenHost();

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
  // ADR 0003：DB root_path → 注入 MA_WORKSPACE_CWD（env 优先，已在 resolve 内处理）
  const { applyWorkspaceCwdToProcess } = await import('./workspace-cwd.js');
  const cwd = applyWorkspaceCwdToProcess();
  if (cwd.configured) {
    console.log(`[cwd] source=${cwd.source} path=${cwd.path}${cwd.exists ? '' : ' (missing on disk)'}`);
  } else {
    console.warn('[cwd] not configured — set via Settings or MA_WORKSPACE_CWD');
  }
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
    // Slice 38：默认 127.0.0.1；局域网暴露设 MA_BIND=0.0.0.0（或 HOST）
    await app.listen({ port: PORT, host: HOST });
    console.log(`✓ server 起在 http://${HOST}:${PORT} (ws: /ws · healthz: /healthz)`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Slice 23：SIGINT/SIGTERM 优雅关停；grace 超时 hard exit，避免卡死
  let shuttingDown = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      console.warn(`[shutdown] reentry ${signal}, already shutting down`);
      return;
    }
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}`);

    const hardExitMs = Number(process.env.MA_SHUTDOWN_HARD_MS ?? DEFAULT_HARD_EXIT_MS);
    const graceMs = Number(process.env.MA_SHUTDOWN_GRACE_MS ?? DEFAULT_SHUTDOWN_GRACE_MS);
    const hardTimer = setTimeout(() => {
      console.error(`[shutdown] hard exit after ${hardExitMs}ms`);
      process.exit(1);
    }, hardExitMs);
    // 不让 hard timer 单独撑住事件循环
    hardTimer.unref?.();

    void (async () => {
      try {
        const report = await shutdownServer({ graceMs });
        console.log(
          `[shutdown] cancelled=${report.cancelled} residual=${report.stillActive.length} timedOut=${report.timedOut}`,
        );
        await app.close();
        process.exit(report.timedOut ? 1 : 0);
      } catch (e) {
        console.error('[shutdown] failed:', e);
        process.exit(1);
      }
    })();
  };

  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));
}

main();

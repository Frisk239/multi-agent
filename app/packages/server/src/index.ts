import { buildApp } from './app.js';
import { startRunWorker } from './orchestration/run-worker.js';
import { scanSkills } from './skill/scanner.js';
import { ensureWikiDir } from './wiki/store.js';

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  // S05：启动时扫 skill 目录建内存索引（spec §5.2，照 hermes 零足迹，不进 DB）
  scanSkills();
  // S06：确保 wiki/ 目录 + 初始 index.md/log.md 存在（spec §3.7）
  ensureWikiDir();
  const app = await buildApp();
  // 启动 RunWorker 轮询（spec §6.2）：listen 前启动，enqueue 时 wake 立即触发
  startRunWorker();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`✓ server 起在 http://localhost:${PORT} (ws: /ws)`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

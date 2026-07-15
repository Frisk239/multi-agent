import { buildApp } from './app.js';
import { startRunWorker } from './orchestration/run-worker.js';

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
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

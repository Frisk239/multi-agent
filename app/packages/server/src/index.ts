import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`✓ server 起在 http://localhost:${PORT} (ws: /ws)`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

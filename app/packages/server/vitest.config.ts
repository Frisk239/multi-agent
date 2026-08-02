import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const setupFile = fileURLToPath(new URL('./src/__test-helpers__/setup.ts', import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: [setupFile],
    // 全量并发（多 worker 共享 CPU）下 buildServer/migration 等重 hook 偶发超
    // 默认 5s/10s —— 放宽降低波动；单测本身不依赖紧超时
    testTimeout: 10_000,
    hookTimeout: 20_000,
  },
});

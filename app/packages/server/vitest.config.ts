import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const setupFile = fileURLToPath(new URL('./src/__test-helpers__/setup.ts', import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: [setupFile],
  },
});

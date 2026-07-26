import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/__test-helpers__/setup.ts'],
  },
});

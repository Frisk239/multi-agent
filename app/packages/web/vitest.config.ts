import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const setupFile = fileURLToPath(new URL('./lib/__test-helpers__/setup.ts', import.meta.url));

export default defineConfig({
  plugins: [
    react({
      include: /\.(jsx|js|tsx|ts)$/,
    }),
  ],
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  esbuild: {
    jsx: 'automatic',
    loader: 'tsx',
    include: /\.(tsx?|jsx?)$/,
  },
  test: {
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.ts', 'components/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: [setupFile],
  },
});

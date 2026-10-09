import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { normalizePath } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer-react', import.meta.url)),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@chillast/degree-format': normalizePath(fileURLToPath(new URL('./src/shared/DegreeFormat.js', import.meta.url))),
      '@chillast/token-budget': normalizePath(fileURLToPath(new URL('./src/core/ai/TokenBudget.js', import.meta.url))),
      '@chillast/search': normalizePath(fileURLToPath(new URL('./src/core/util/FuzzySearch.js', import.meta.url))),
      '@chillast/unicode-case-fold': normalizePath(fileURLToPath(new URL('./src/core/util/UnicodeCaseFold.js', import.meta.url))),
      '@chillast/chart-result-for-request': normalizePath(fileURLToPath(new URL('./src/shared/ChartResultForRequest.js', import.meta.url))),
    },
  },
  // Local CommonJS modules also need prebundling when served to the browser.
  // Production builds convert them automatically; the dev server does not.
  optimizeDeps: {
    include: [
      '@chillast/degree-format',
      '@chillast/token-budget',
      '@chillast/search',
      '@chillast/unicode-case-fold',
      '@chillast/chart-result-for-request',
    ],
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer-react', import.meta.url)),
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: [fileURLToPath(new URL('./src/renderer-react/test/setup.ts', import.meta.url))],
    include: ['**/*.test.{ts,tsx}'],
    css: true,
  },
});

import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer-react', import.meta.url)),
  base: './',
  plugins: [react()],
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

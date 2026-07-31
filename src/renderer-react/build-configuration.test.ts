import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const repositoryRoot = process.cwd();

test('restricts renderer connections to self and localhost Vite HMR', () => {
  const html = readFileSync(resolve(repositoryRoot, 'src/renderer-react/index.html'), 'utf8');
  const connectSources = html.match(/connect-src ([^;]+);/)?.[1];

  expect(connectSources).toBe("'self' ws://127.0.0.1:*");
  expect(connectSources).not.toMatch(/\bhttps?:/);
  expect(html).toContain('<script vite-ignore src="./theme-bootstrap.js"></script>');
});

test('keeps TypeScript build information under the ignored dist directory', () => {
  const tsconfig = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'tsconfig.renderer.json'), 'utf8'),
  ) as { compilerOptions: { tsBuildInfoFile?: string }; include: string[] };

  expect(tsconfig.compilerOptions.tsBuildInfoFile).toBe(
    './dist/.cache/tsconfig.renderer.tsbuildinfo',
  );
  expect(tsconfig.include).toContain('vite.config.mts');
  expect(existsSync(resolve(repositoryRoot, 'vite.config.mts'))).toBe(true);
  expect(existsSync(resolve(repositoryRoot, 'vite.config.ts'))).toBe(false);
});

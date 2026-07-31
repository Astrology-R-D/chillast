import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';

const stylesDirectory = resolve(process.cwd(), 'src/renderer-react/styles');

test('defines all Maple Mono faces with resolvable repository assets', () => {
  const fontsPath = resolve(stylesDirectory, 'fonts.css');
  const css = readFileSync(fontsPath, 'utf8');
  const urls = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((match) => match[1]);

  expect(urls).toHaveLength(4);
  expect(css.match(/font-family: 'Maple Mono NF CN'/g)).toHaveLength(4);
  expect(css.match(/font-style: normal/g)).toHaveLength(4);
  expect(css.match(/font-display: swap/g)).toHaveLength(4);
  expect(css).toMatch(/font-weight: 400/);
  expect(css).toMatch(/font-weight: 500/);
  expect(css).toMatch(/font-weight: 600/);
  expect(css).toMatch(/font-weight: 700/);
  expect(urls.every((url) => existsSync(resolve(dirname(fontsPath), url)))).toBe(true);
});

test('defines theme, density, token, and global foundations', () => {
  const tokens = readFileSync(resolve(stylesDirectory, 'tokens.css'), 'utf8');
  const themes = readFileSync(resolve(stylesDirectory, 'themes.css'), 'utf8');
  const density = readFileSync(resolve(stylesDirectory, 'density.css'), 'utf8');
  const global = readFileSync(resolve(stylesDirectory, 'global.css'), 'utf8');

  expect(tokens).toContain("--font-family: 'Maple Mono NF CN'");
  expect(tokens).toContain('--radius-sm: 4px');
  expect(tokens).toContain('--radius-md: 6px');
  expect(tokens).toContain('--radius-lg: 8px');
  expect(tokens).toContain('--motion-fast: 120ms');
  expect(tokens).toContain('--motion-normal: 170ms');
  expect(tokens).toContain('letter-spacing: 0');
  expect(themes).toContain('--surface-base: #f4f4f6');
  expect(themes).toContain('--surface-work: #ffffff');
  expect(themes).toContain('--surface-base: #171719');
  expect(themes).toContain('--surface-work: #1c1c1f');
  expect(density).toMatch(/data-density='compact'[\s\S]*--control-height: 32px/);
  expect(density).toMatch(/data-density='comfortable'[\s\S]*--control-height: 36px/);
  expect(global).toContain('overflow: hidden');
  expect(global).toContain(':focus-visible');
  expect(global).toContain('prefers-reduced-motion: reduce');
});

test('Vite emits all four fonts and rewrites production CSS asset paths', async () => {
  const result = await build({
    configFile: resolve(process.cwd(), 'vite.config.mts'),
    logLevel: 'silent',
    build: { write: false },
  });

  if (Array.isArray(result) || !('output' in result)) {
    throw new Error('Expected a single in-memory Vite build output');
  }

  const assets = result.output.filter((output) => output.type === 'asset');
  const fontAssets = assets.filter((asset) => asset.fileName.endsWith('.ttf'));
  const productionCss = assets
    .filter((asset) => asset.fileName.endsWith('.css'))
    .map((asset) => asset.source.toString())
    .join('\n');

  expect(fontAssets).toHaveLength(4);
  expect(productionCss).not.toContain('../../../fonts/');
  expect(productionCss.match(/url\([^)]*\.ttf\)/g)).toHaveLength(4);
});

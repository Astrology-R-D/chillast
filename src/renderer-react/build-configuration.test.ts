import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
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

test('packages only legacy-referenced upright fonts within the payload budgets', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
    build: { files: string[] };
  };
  const fontEntries = packageJson.build.files.filter((entry) => entry.startsWith('fonts/'));
  const expectedEntries = [
    'fonts/LICENSE.txt',
    'fonts/MapleMono-NF-CN-Bold.ttf',
    'fonts/MapleMono-NF-CN-Medium.ttf',
    'fonts/MapleMono-NF-CN-Regular.ttf',
    'fonts/MapleMono-NF-CN-SemiBold.ttf',
  ];

  expect(fontEntries.some((entry) => entry.includes('*'))).toBe(false);
  expect(fontEntries.some((entry) => /italic/i.test(entry))).toBe(false);
  expect([...fontEntries].sort()).toEqual(expectedEntries);

  const selectedRootFonts = fontEntries.filter((entry) => entry.endsWith('.ttf'));
  expect(selectedRootFonts).toHaveLength(4);
  expect(
    selectedRootFonts.reduce((total, entry) => total + statSync(resolve(repositoryRoot, entry)).size, 0),
  ).toBeLessThan(90 * 1024 * 1024);

  const legacyThemePath = resolve(repositoryRoot, 'src/renderer/styles/Theme.css');
  const legacyTheme = readFileSync(legacyThemePath, 'utf8');
  const legacyFontUrls = [...legacyTheme.matchAll(/url\(['"]?([^'")]+\.ttf)/g)].map(
    (match) => match[1],
  );
  expect(legacyFontUrls).toHaveLength(4);
  for (const fontUrl of legacyFontUrls) {
    const resolvedFontPath = resolve(dirname(legacyThemePath), fontUrl);
    const repositoryPath = relative(repositoryRoot, resolvedFontPath).replaceAll('\\', '/');
    expect(existsSync(resolvedFontPath), fontUrl).toBe(true);
    expect(selectedRootFonts, fontUrl).toContain(repositoryPath);
  }

  expect(packageJson.build.files).toContain('dist/renderer-react/**/*');
  expect(packageJson.build.files).toContain('!src/renderer-react/assets/fonts/**/*');
  const reactFontDirectory = resolve(repositoryRoot, 'src/renderer-react/assets/fonts');
  const reactFonts = readdirSync(reactFontDirectory).filter((fileName) => fileName.endsWith('.woff2'));
  expect(reactFonts).toHaveLength(4);
  expect(
    reactFonts.reduce(
      (total, fileName) => total + statSync(resolve(reactFontDirectory, fileName)).size,
      0,
    ),
  ).toBeLessThan(10 * 1024 * 1024);
});

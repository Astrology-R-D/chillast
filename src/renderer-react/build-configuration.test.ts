import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { build as viteBuild } from 'vite';

const repositoryRoot = process.cwd();
const packageJson = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as { dependencies: Record<string, string>; build: { files: string[] } };

interface BuildOutput {
  output: Array<{ type: string; code?: string }>;
}

test('declares the accessible primitives used by chart filters', () => {
  expect(packageJson.dependencies).toMatchObject({
    '@radix-ui/react-dialog': expect.any(String),
    '@radix-ui/react-popover': expect.any(String),
    '@radix-ui/react-tooltip': expect.any(String),
  });
});

test('loads the chart workbench outside the initial renderer chunk', () => {
  const shell = readFileSync(resolve(repositoryRoot, 'src/renderer-react/shell/AppShell.tsx'), 'utf8');
  expect(shell).toMatch(/return import\(['"]\.\.\/features\/charts\/workbench\/ChartWorkbenchPage['"]\)/);
  expect(shell).toMatch(/lazy\(\(\) => loadChartWorkbench\(\)/);
  expect(shell).not.toMatch(/^import .*ChartWorkbenchPage.*from/m);
});

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

test('bundles the shared CommonJS Unicode fold implementation for the browser', async () => {
  const output = await viteBuild({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve(repositoryRoot, 'src/renderer-react/features/profiles/directory.ts'),
        formats: ['es'],
      },
    },
  }) as BuildOutput | BuildOutput[];
  const outputs = Array.isArray(output) ? output : [output];
  const code = outputs
    .flatMap((item) => item.output)
    .find((item) => item.type === 'chunk')?.code;

  expect(code).not.toMatch(/\brequire\s*\(|\bprocess\b|\bBuffer\b/);

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code ?? '').toString('base64')}`;
  const bundled = await import(/* @vite-ignore */ moduleUrl) as {
    selectDirectoryProfiles: (
      profiles: unknown[],
      query: { search: string; recent: string; sort: string },
      recents: Record<string, number>,
      now: number,
    ) => Array<{ id: string }>;
  };
  const profile = {
    id: 'folded',
    nameZh: '',
    nameEn: 'Straße',
    birthData: {
      year: 2000,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      location: { label: '', latitude: 0, longitude: 0 },
    },
    notes: '',
    tags: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  expect(bundled.selectDirectoryProfiles(
    [profile],
    { search: 'STRASSE', recent: 'all', sort: 'name-asc' },
    {},
    Date.parse('2026-08-02T12:00:00.000Z'),
  ).map(({ id }) => id)).toEqual(['folded']);
});

test('packages only legacy-referenced upright fonts within the payload budgets', () => {
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

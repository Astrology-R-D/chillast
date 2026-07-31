import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';

const stylesDirectory = resolve(process.cwd(), 'src/renderer-react/styles');

const approvedThemes = {
  light: {
    'surface-base': '#f4f4f6',
    'surface-panel': 'rgba(250, 250, 251, .88)',
    'surface-work': '#fff',
    'surface-raised': '#fff',
    'surface-hover': '#ededf0',
    'surface-selected': '#e5e5e9',
    'text-primary': '#18181b',
    'text-secondary': '#5b5b63',
    'text-muted': '#6f6f77',
    'border-subtle': 'rgba(24, 24, 27, .10)',
    'border-strong': 'rgba(24, 24, 27, .20)',
    focus: '#2563eb',
    danger: '#c93434',
    success: '#167a50',
    'shadow-float': '0 12px 32px rgba(24, 24, 27, .14)',
  },
  dark: {
    'surface-base': '#171719',
    'surface-panel': 'rgba(30, 30, 33, .88)',
    'surface-work': '#1c1c1f',
    'surface-raised': '#26262a',
    'surface-hover': '#2b2b2f',
    'surface-selected': '#333338',
    'text-primary': '#f0f0f2',
    'text-secondary': '#aaaab2',
    'text-muted': '#8e8e96',
    'border-subtle': 'rgba(255, 255, 255, .09)',
    'border-strong': 'rgba(255, 255, 255, .17)',
    focus: '#6ea8fe',
    danger: '#ff6b6b',
    success: '#50c99a',
    'shadow-float': '0 16px 40px rgba(0, 0, 0, .36)',
  },
} as const;

function getThemeBlock(css: string, theme: keyof typeof approvedThemes): string {
  const selector = theme === 'light' ? ":root\\[data-theme='light'\\]" : ":root\\[data-theme='dark'\\]";
  const block = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`Missing ${theme} theme block`);
  return block;
}

function getToken(block: string, token: string): string {
  const value = block.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing --${token}`);
  return value.trim();
}

function relativeLuminance(hex: string): number {
  const value = hex.slice(1);
  const channels = (value.length === 3 ? [...value].map((character) => character.repeat(2)) : value.match(/../g))!;
  const [red, green, blue] = channels.map((channel) => {
    const component = Number.parseInt(channel, 16) / 255;
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

test('defines four compact Maple Mono WOFF2 faces', () => {
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
  expect(urls.every((url) => url.endsWith('.woff2'))).toBe(true);

  for (const url of urls) {
    const assetPath = resolve(dirname(fontsPath), url);
    expect(existsSync(assetPath), url).toBe(true);
    const size = statSync(assetPath).size;
    expect(size, `${url} should be nontrivial`).toBeGreaterThan(1_000);
    expect(size, `${url} should remain below 5 MB`).toBeLessThan(5_000_000);
  }
});

test('defines theme, density, token, and global foundations', () => {
  const tokens = readFileSync(resolve(stylesDirectory, 'tokens.css'), 'utf8');
  const themes = readFileSync(resolve(stylesDirectory, 'themes.css'), 'utf8');
  const density = readFileSync(resolve(stylesDirectory, 'density.css'), 'utf8');
  const global = readFileSync(resolve(stylesDirectory, 'global.css'), 'utf8');

  expect(tokens).toContain("--font-family: 'Maple Mono NF CN'");
  expect(tokens).toContain("'Microsoft YaHei', 'Segoe UI', sans-serif");
  expect(tokens).toContain('--radius-sm: 4px');
  expect(tokens).toContain('--radius-md: 6px');
  expect(tokens).toContain('--radius-lg: 8px');
  expect(tokens).toContain('--motion-fast: 120ms');
  expect(tokens).toContain('--motion-normal: 170ms');
  expect(tokens).toContain('letter-spacing: 0');
  for (const [theme, expectedTokens] of Object.entries(approvedThemes)) {
    const block = getThemeBlock(themes, theme as keyof typeof approvedThemes);
    for (const [token, value] of Object.entries(expectedTokens)) {
      expect(block, `${theme} --${token}`).toContain(`--${token}: ${value};`);
    }
  }
  expect(density).toMatch(/data-density='compact'[\s\S]*--control-height: 32px/);
  expect(density).toMatch(/data-density='comfortable'[\s\S]*--control-height: 36px/);
  expect(global).toContain('overflow: hidden');
  expect(global).toContain(':focus-visible');
  expect(global).toContain('var(--focus)');
  expect(global).not.toContain('var(--focus-ring)');
  expect(global).toContain('prefers-reduced-motion: reduce');
});

test.each(['light', 'dark'] as const)(
  '%s muted text meets WCAG AA on base and work surfaces while remaining subordinate',
  (theme) => {
    const themes = readFileSync(resolve(stylesDirectory, 'themes.css'), 'utf8');
    const block = getThemeBlock(themes, theme);
    const muted = getToken(block, 'text-muted');
    const secondary = getToken(block, 'text-secondary');

    for (const surface of ['surface-base', 'surface-work']) {
      const background = getToken(block, surface);
      expect(contrastRatio(muted, background), `${theme} muted on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(secondary, background)).toBeGreaterThan(contrastRatio(muted, background));
    }
  },
);

test('Vite emits four WOFF2 subsets under 10 MB total with rewritten CSS paths', async () => {
  const result = await build({
    configFile: resolve(process.cwd(), 'vite.config.mts'),
    logLevel: 'silent',
    build: { write: false },
  });

  if (Array.isArray(result) || !('output' in result)) {
    throw new Error('Expected a single in-memory Vite build output');
  }

  const assets = result.output.filter((output) => output.type === 'asset');
  const fontAssets = assets.filter((asset) => asset.fileName.endsWith('.woff2'));
  const productionCss = assets
    .filter((asset) => asset.fileName.endsWith('.css'))
    .map((asset) => asset.source.toString())
    .join('\n');

  expect(fontAssets).toHaveLength(4);
  expect(
    fontAssets.reduce(
      (total, asset) =>
        total + (typeof asset.source === 'string' ? Buffer.byteLength(asset.source) : asset.source.length),
      0,
    ),
  ).toBeLessThan(10_000_000);
  expect(productionCss).not.toContain('.ttf');
  expect(productionCss.match(/url\([^)]*\.woff2\)/g)).toHaveLength(4);
});

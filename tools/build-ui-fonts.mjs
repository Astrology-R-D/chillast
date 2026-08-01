import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import subsetFont from 'subset-font';

const localePath = fileURLToPath(new URL('../locale/zh.json', import.meta.url));
const outputDirectory = fileURLToPath(
  new URL('../src/renderer-react/assets/fonts', import.meta.url),
);

const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, index) =>
  String.fromCodePoint(index + 32),
).join('');
const UI_AND_ASTROLOGY_GLYPHS =
  '，。；：！？、（）【】《》「」『』“”‘’…—·＋−×÷°′″℞' +
  '♈♉♊♋♌♍♎♏♐♑♒♓☉☽☿♀♂♃♄♅♆♇⚷☊☋⚸☌☍△□✱⚻⚼∠⚺✶' +
  '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥金木水火土阴阳' +
  '鼠牛虎兔龙蛇马羊猴鸡狗猪';

const fontWeights = [
  ['Regular', 'MapleMono-NF-CN-Regular.ttf'],
  ['Medium', 'MapleMono-NF-CN-Medium.ttf'],
  ['SemiBold', 'MapleMono-NF-CN-SemiBold.ttf'],
  ['Bold', 'MapleMono-NF-CN-Bold.ttf'],
];

function openFont(buffer, label) {
  const font = fontkit.create(buffer);
  if (!('glyphForCodePoint' in font)) throw new Error(`Expected a single font in ${label}`);
  return font;
}

function supports(font, character) {
  return font.glyphForCodePoint(character.codePointAt(0)).id !== 0;
}

function codePointLabel(character) {
  return `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

function collectStrings(value, strings = []) {
  if (typeof value === 'string') {
    strings.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, strings);
  }
  return strings;
}

const locale = JSON.parse(await readFile(localePath, 'utf8'));
const requested = [
  ...new Set(`${PRINTABLE_ASCII}${UI_AND_ASTROLOGY_GLYPHS}${collectStrings(locale).join('')}`),
].sort((left, right) => left.codePointAt(0) - right.codePointAt(0));

const sources = await Promise.all(
  fontWeights.map(async ([weight, inputName]) => {
    const inputPath = fileURLToPath(new URL(`../fonts/${inputName}`, import.meta.url));
    const buffer = await readFile(inputPath);
    const font = openFont(buffer, inputName);
    return {
      weight,
      buffer,
      supported: requested.filter((character) => supports(font, character)),
      missing: requested.filter((character) => !supports(font, character)),
    };
  }),
);

const supportedSignature = sources[0].supported.join('');
const missingSignature = sources[0].missing.join('');
for (const source of sources.slice(1)) {
  if (source.supported.join('') !== supportedSignature || source.missing.join('') !== missingSignature) {
    throw new Error(`Maple source cmap differs for ${source.weight}`);
  }
}

await mkdir(outputDirectory, { recursive: true });

for (const source of sources) {
  const outputPath = fileURLToPath(
    new URL(`../src/renderer-react/assets/fonts/MapleMono-NF-CN-${source.weight}.woff2`, import.meta.url),
  );
  const subset = await subsetFont(source.buffer, supportedSignature, { targetFormat: 'woff2' });
  const subsetFontFile = openFont(subset, outputPath);
  const lost = source.supported.filter((character) => !supports(subsetFontFile, character));
  if (lost.length > 0) {
    throw new Error(
      `${source.weight} subset lost source-supported glyphs: ${lost.map(codePointLabel).join(', ')}`,
    );
  }
  await writeFile(outputPath, subset);
  console.log(`${source.weight}: ${subset.length} bytes, ${source.supported.length} characters`);
}

const manifest = {
  version: 1,
  requestedCharacterCount: requested.length,
  subsetCharacterCount: sources[0].supported.length,
  sourceMissing: sources[0].missing.map((character) => ({
    character,
    codePoint: codePointLabel(character),
  })),
};
await writeFile(
  fileURLToPath(new URL('../src/renderer-react/assets/fonts/manifest.json', import.meta.url)),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Source-missing fallback characters: ${manifest.sourceMissing.length}`);

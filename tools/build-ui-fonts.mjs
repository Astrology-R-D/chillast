import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
const glyphs = [...new Set(`${PRINTABLE_ASCII}${UI_AND_ASTROLOGY_GLYPHS}${collectStrings(locale).join('')}`)]
  .sort((left, right) => left.codePointAt(0) - right.codePointAt(0))
  .join('');

await mkdir(outputDirectory, { recursive: true });

for (const [weight, inputName] of fontWeights) {
  const inputPath = fileURLToPath(new URL(`../fonts/${inputName}`, import.meta.url));
  const outputPath = fileURLToPath(
    new URL(`../src/renderer-react/assets/fonts/MapleMono-NF-CN-${weight}.woff2`, import.meta.url),
  );
  const subset = await subsetFont(await readFile(inputPath), glyphs, { targetFormat: 'woff2' });
  await writeFile(outputPath, subset);
  console.log(`${weight}: ${subset.length} bytes, ${[...glyphs].length} characters`);
}

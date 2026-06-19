'use strict';

const HEAVENLY_STEMS = [
  { index: 0, char: '甲', pinyin: 'jiǎ',  element: 'wood',  yinYang: 'yang' },
  { index: 1, char: '乙', pinyin: 'yǐ',   element: 'wood',  yinYang: 'yin'  },
  { index: 2, char: '丙', pinyin: 'bǐng',  element: 'fire',  yinYang: 'yang' },
  { index: 3, char: '丁', pinyin: 'dīng',  element: 'fire',  yinYang: 'yin'  },
  { index: 4, char: '戊', pinyin: 'wù',    element: 'earth', yinYang: 'yang' },
  { index: 5, char: '己', pinyin: 'jǐ',    element: 'earth', yinYang: 'yin'  },
  { index: 6, char: '庚', pinyin: 'gēng',  element: 'metal', yinYang: 'yang' },
  { index: 7, char: '辛', pinyin: 'xīn',   element: 'metal', yinYang: 'yin'  },
  { index: 8, char: '壬', pinyin: 'rén',   element: 'water', yinYang: 'yang' },
  { index: 9, char: '癸', pinyin: 'guǐ',   element: 'water', yinYang: 'yin'  },
];

const EARTHLY_BRANCHES = [
  { index: 0,  char: '子', pinyin: 'zǐ',   animal: '鼠', element: 'water', yinYang: 'yang', hours: '23:00-01:00' },
  { index: 1,  char: '丑', pinyin: 'chǒu',  animal: '牛', element: 'earth', yinYang: 'yin',  hours: '01:00-03:00' },
  { index: 2,  char: '寅', pinyin: 'yín',   animal: '虎', element: 'wood',  yinYang: 'yang', hours: '03:00-05:00' },
  { index: 3,  char: '卯', pinyin: 'mǎo',   animal: '兔', element: 'wood',  yinYang: 'yin',  hours: '05:00-07:00' },
  { index: 4,  char: '辰', pinyin: 'chén',  animal: '龙', element: 'earth', yinYang: 'yang', hours: '07:00-09:00' },
  { index: 5,  char: '巳', pinyin: 'sì',    animal: '蛇', element: 'fire',  yinYang: 'yin',  hours: '09:00-11:00' },
  { index: 6,  char: '午', pinyin: 'wǔ',    animal: '马', element: 'fire',  yinYang: 'yang', hours: '11:00-13:00' },
  { index: 7,  char: '未', pinyin: 'wèi',   animal: '羊', element: 'earth', yinYang: 'yin',  hours: '13:00-15:00' },
  { index: 8,  char: '申', pinyin: 'shēn',  animal: '猴', element: 'metal', yinYang: 'yang', hours: '15:00-17:00' },
  { index: 9,  char: '酉', pinyin: 'yǒu',   animal: '鸡', element: 'metal', yinYang: 'yin',  hours: '17:00-19:00' },
  { index: 10, char: '戌', pinyin: 'xū',    animal: '狗', element: 'earth', yinYang: 'yang', hours: '19:00-21:00' },
  { index: 11, char: '亥', pinyin: 'hài',   animal: '猪', element: 'water', yinYang: 'yin',  hours: '21:00-23:00' },
];

const FIVE_ELEMENTS = [
  { key: 'wood',  nameZh: '木' },
  { key: 'fire',  nameZh: '火' },
  { key: 'earth', nameZh: '土' },
  { key: 'metal', nameZh: '金' },
  { key: 'water', nameZh: '水' },
];

const ZODIAC_ANIMALS = [
  { key: 'rat',     nameZh: '鼠' },
  { key: 'ox',      nameZh: '牛' },
  { key: 'tiger',   nameZh: '虎' },
  { key: 'rabbit',  nameZh: '兔' },
  { key: 'dragon',  nameZh: '龙' },
  { key: 'snake',   nameZh: '蛇' },
  { key: 'horse',   nameZh: '马' },
  { key: 'goat',    nameZh: '羊' },
  { key: 'monkey',  nameZh: '猴' },
  { key: 'rooster', nameZh: '鸡' },
  { key: 'dog',     nameZh: '狗' },
  { key: 'pig',     nameZh: '猪' },
];

const STEM_MAP = Object.fromEntries(HEAVENLY_STEMS.map((s) => [s.char, s]));
const BRANCH_MAP = Object.fromEntries(EARTHLY_BRANCHES.map((b) => [b.char, b]));

module.exports = {
  HEAVENLY_STEMS,
  EARTHLY_BRANCHES,
  FIVE_ELEMENTS,
  ZODIAC_ANIMALS,
  STEM_MAP,
  BRANCH_MAP,
};

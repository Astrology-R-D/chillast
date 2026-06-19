'use strict';

const { STEM_MAP, BRANCH_MAP } = require('./ChineseAstrologyConstants');

class ChineseAstrologyAdapter {
  constructor(sxwnl) {
    this.sxwnl = sxwnl;
  }

  computeBaZi(birthData, longitude) {
    const { JD, J2000, obb } = this.sxwnl;

    JD.Y = birthData.year;
    JD.M = birthData.month;
    JD.D = birthData.day;
    JD.h = birthData.hour;
    JD.m = birthData.minute;
    JD.s = 0;

    const jd = JD.toJD() - J2000;
    const J = longitude * Math.PI / 180;

    const ob = {};
    obb.mingLiBaZi(jd, J, ob);

    return {
      pillars: {
        year:  this._parsePillar(ob.bz_jn),
        month: this._parsePillar(ob.bz_jy),
        day:   this._parsePillar(ob.bz_jr),
        hour:  this._parsePillar(ob.bz_js),
      },
      dayMaster: this._parseStem(ob.bz_jr[0]),
      localTrueSolarTime: ob.bz_zty || '',
      allHourPillars: this._parseHourPillars(ob.bz_JS || ''),
    };
  }

  getLunarDate(year, month, day) {
    const { Lunar, obb } = this.sxwnl;

    const lun = new Lunar();
    lun.yueLiCalc(year, month);
    const ob = lun.lun[day - 1];

    const c = ob.Lyear + 12000;
    const animalChar = obb.ShX[c % 12];

    return {
      lunarYear: ob.Lyear2,
      lunarMonth: ob.Lmc,
      lunarDay: ob.Ldc,
      isLeapMonth: ob.Lleap === '闰',
      zodiacAnimal: animalChar,
      solarTerm: ob.Ljq || null,
      constellation: ob.XiZ,
      huangdiYear: ob.Lyear4,
    };
  }

  _parsePillar(fullStr) {
    const stem = fullStr[0];
    const branch = fullStr[1];
    return {
      full: fullStr,
      stem: this._parseStem(stem),
      branch: this._parseBranch(branch),
    };
  }

  _parseStem(char) {
    const meta = STEM_MAP[char];
    return meta
      ? { char, element: meta.element, yinYang: meta.yinYang }
      : { char, element: 'unknown', yinYang: 'unknown' };
  }

  _parseBranch(char) {
    const meta = BRANCH_MAP[char];
    return meta
      ? { char, element: meta.element, yinYang: meta.yinYang, animal: meta.animal }
      : { char, element: 'unknown', yinYang: 'unknown', animal: '' };
  }

  _parseHourPillars(raw) {
    return raw.replace(/<[^>]+>/g, '').trim().split(/\s+/).filter(Boolean);
  }
}

module.exports = ChineseAstrologyAdapter;

'use strict';

const { STEM_MAP, BRANCH_MAP } = require('./ChineseAstrologyConstants');

const SHICHEN = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const SHICHEN_HOURS = ['23-01','01-03','03-05','05-07','07-09','09-11','11-13','13-15','15-17','17-19','19-21','21-23'];

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

    const hourStem = ob.bz_js ? ob.bz_js[0] : '';

    return {
      pillars: {
        year:  this._parsePillar(ob.bz_jn),
        month: this._parsePillar(ob.bz_jy),
        day:   this._parsePillar(ob.bz_jr),
        hour:  this._parsePillar(ob.bz_js),
      },
      dayMaster: this._parseStem(ob.bz_jr[0]),
      localTrueSolarTime: ob.bz_zty || '',
      allHourPillars: this._parseHourPillars(ob.bz_JS || '', hourStem),
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
      eraName: lun.nianhao || '',
      monthSize: ob.Ldn || 0,
      festivals: {
        major: ob.A || '',
        important: ob.B || '',
        minor: ob.C || '',
        isHoliday: Boolean(ob.Fjia),
      },
      moonPhase: {
        name: ob.yxmc || '',
        time: ob.yxsj || '',
      },
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

  _parseHourPillars(raw, currentHourStem) {
    const clean = raw.replace(/<[^>]+>/g, '').trim();
    const pairs = clean.match(/[\u4e00-\u9fff]{2}/g) || [];
    return pairs.slice(0, 12).map((gz, i) => ({
      shichen: SHICHEN[i] || '',
      hours: SHICHEN_HOURS[i] || '',
      stem: this._parseStem(gz[0]),
      branch: this._parseBranch(gz[1]),
      full: gz,
      isCurrent: gz[0] === currentHourStem,
    }));
  }
}

module.exports = ChineseAstrologyAdapter;

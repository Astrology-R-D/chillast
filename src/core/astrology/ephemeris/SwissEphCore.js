'use strict';

const fs = require('fs');
const {
  SIDEREAL_FLAGS,
  SIDEREAL_HOUSE_FLAGS,
  SIDEREAL_MODE,
  TROPICAL_FLAGS,
  swisseph,
} = require('./SwissEphConstants');

function checked(result, label) {
  if (result && result.error) throw new Error(`${label}: ${result.error}`);
  return result;
}

function createSwissEphCore(swiss, fsApi) {
  let ephePath = null;
  let initialized = false;

  function prepare(zodiac) {
    if (zodiac !== 'tropical' && zodiac !== 'sidereal') {
      throw new Error(`Unknown zodiac mode: ${zodiac}`);
    }
    if (!initialized) {
      if (!ephePath) throw new Error('星历数据路径未配置（需由 Main 注入）');
      if (!fsApi.existsSync(ephePath)) throw new Error(`星历数据目录不存在: ${ephePath}`);
      swiss.swe_set_ephe_path(ephePath);
      initialized = true;
    }
    if (zodiac === 'sidereal') swiss.swe_set_sid_mode(SIDEREAL_MODE, 0, 0);
  }

  return {
    configure({ ephePath: nextPath } = {}) {
      ephePath = nextPath || null;
    },
    calcBody(jdUt, planetId, zodiac = 'tropical') {
      prepare(zodiac);
      const flags = zodiac === 'sidereal' ? SIDEREAL_FLAGS : TROPICAL_FLAGS;
      return checked(swiss.swe_calc_ut(jdUt, planetId, flags), `星历计算失败 (planetId=${planetId})`);
    },
    houses(jdUt, lat, lng, hsysCode, zodiac = 'tropical') {
      prepare(zodiac);
      const result = zodiac === 'sidereal'
        ? swiss.swe_houses_ex(jdUt, SIDEREAL_HOUSE_FLAGS, lat, lng, hsysCode)
        : swiss.swe_houses(jdUt, lat, lng, hsysCode);
      return checked(result, '宫位计算失败');
    },
    housePos(lat, lng, hsysCode, longitude, latitude = 0, zodiac = 'tropical') {
      prepare(zodiac);
      return Math.floor(checked(
        swiss.swe_house_pos(lat, lng, hsysCode, [longitude, latitude]),
        '落宫计算失败',
      ).housePosition);
    },
    julDay(year, month, day, hour) {
      return swiss.swe_julday(year, month, day, hour, swiss.SE_GREG_CAL);
    },
    close() {
      if (initialized) swiss.swe_close();
      initialized = false;
    },
  };
}

const singleton = createSwissEphCore(swisseph, fs);

module.exports = singleton;
module.exports.createSwissEphCore = createSwissEphCore;

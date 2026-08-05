'use strict';

const profileA = {
  id: 'chart-smoke-a', nameZh: '星盘烟测甲', nameEn: 'Chart Smoke A', gender: 'other',
  birthData: {
    year: 1990, month: 1, day: 15, hour: 14, minute: 30,
    location: { label: '北京 / Beijing', latitude: 39.9042, longitude: 116.4074 },
  },
  notes: 'Swiss natal fixture', tags: ['chart-smoke'],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
};

const profileB = {
  id: 'chart-smoke-b', nameZh: '星盘烟测乙', nameEn: 'Chart Smoke B', gender: 'other',
  birthData: {
    year: 1988, month: 6, day: 7, hour: 8, minute: 9,
    location: { label: '杭州 / Hangzhou', latitude: 30.2741, longitude: 120.1551 },
  },
  notes: 'Swiss synastry fixture', tags: ['chart-smoke'],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

function settings(zodiac = 'sidereal') {
  return {
    houseSystem: 'placidus',
    zodiac,
    aspects: {
      enabled: ['conjunction', 'opposition', 'trine', 'square', 'sextile'],
      orbOverrides: {},
    },
  };
}

function natalRequest(overrides = {}) {
  return { type: 'natal', primary: profileA, settings: settings(), options: {}, ...overrides };
}

function synastryRequest(overrides = {}) {
  return { type: 'synastry', primary: profileA, secondary: profileB, settings: settings(), options: {}, ...overrides };
}

class DelayedAstrologyService {
  constructor(realService) {
    this.real = realService;
    this.pending = [];
  }

  chartTypes() { return this.real.chartTypes(); }
  referenceData() { return this.real.referenceData(); }

  computeChart(request) {
    return new Promise((resolve, reject) => this.pending.push({ request, resolve, reject, settled: false }));
  }

  resolve(index) {
    const item = this._item(index);
    try { item.resolve(this.real.computeChart(item.request)); } catch (error) { item.reject(error); }
  }

  resolveValue(index, value) { this._item(index).resolve(value); }
  reject(index, message) { this._item(index).reject(new Error(message)); }

  _item(index) {
    const item = this.pending[index];
    if (!item || item.settled) throw new Error(`No unsettled chart request at index ${index}`);
    item.settled = true;
    return item;
  }
}

module.exports = { DelayedAstrologyService, natalRequest, profileA, profileB, settings, synastryRequest };

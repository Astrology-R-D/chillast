'use strict';

const AngleMath = require('../util/AngleMath');
const {
  ZODIAC_SIGNS, CELESTIAL_POINTS, ASPECTS, ANGLE_KEYS,
} = require('./Constants');

/**
 * ChartData — pure builders that turn raw, numeric chart frames into fully
 * enriched, IPC-serialisable DTOs the renderer can paint without any astrology
 * knowledge of its own. Every function is stateless.
 */
const ChartData = {
  /** Enrich a raw point (from HoroscopeAdapter) with display metadata. */
  enrichPoint(point) {
    const meta = CELESTIAL_POINTS[point.key] || { nameEn: point.key, nameZh: point.key, glyph: '?' };
    const sign = ZODIAC_SIGNS[point.signIndex];
    return {
      key: point.key,
      kind: point.kind,
      glyph: meta.glyph,
      nameEn: meta.nameEn,
      nameZh: meta.nameZh,
      longitude: Number(point.longitude.toFixed(4)),
      signKey: sign.key,
      signGlyph: sign.glyph,
      signNameZh: sign.nameZh,
      signIndex: point.signIndex,
      degreeInSign: Number(point.degreeInSign.toFixed(4)),
      dms: AngleMath.toDms(point.degreeInSign),
      retrograde: Boolean(point.retrograde),
      house: point.house,
    };
  },

  /** Enrich an aspect record (from AspectEngine) with display metadata. */
  enrichAspect(aspect) {
    const def = ASPECTS[aspect.aspectKey] || {};
    return {
      point1: aspect.point1,
      point2: aspect.point2,
      aspectKey: aspect.aspectKey,
      glyph: def.glyph || '',
      nameZh: def.nameZh || aspect.aspectKey,
      nameEn: def.nameEn || aspect.aspectKey,
      level: aspect.level,
      exactAngle: aspect.exactAngle,
      orb: aspect.orb,
      orbUsed: aspect.orbUsed,
      strength: aspect.strength,
      separation: aspect.separation,
    };
  },

  /** Build the four enriched chart angles from raw longitudes. */
  enrichAngles(rawAngles) {
    const out = {};
    for (const key of ANGLE_KEYS) {
      const longitude = AngleMath.normalize(rawAngles[key]);
      const signIndex = AngleMath.signIndex(longitude);
      const sign = ZODIAC_SIGNS[signIndex];
      const degreeInSign = AngleMath.degreeInSign(longitude);
      out[key] = {
        key,
        glyph: CELESTIAL_POINTS[key].glyph,
        nameZh: CELESTIAL_POINTS[key].nameZh,
        longitude: Number(longitude.toFixed(4)),
        signKey: sign.key,
        signGlyph: sign.glyph,
        signIndex,
        degreeInSign: Number(degreeInSign.toFixed(4)),
        dms: AngleMath.toDms(degreeInSign),
      };
    }
    return out;
  },

  /** Enrich house cusps with sign metadata. */
  enrichHouses(rawHouses) {
    return rawHouses
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((house) => {
        const signIndex = AngleMath.signIndex(house.cuspLongitude);
        const sign = ZODIAC_SIGNS[signIndex];
        return {
          index: house.index,
          cuspLongitude: Number(house.cuspLongitude.toFixed(4)),
          signKey: sign.key,
          signGlyph: sign.glyph,
          signNameZh: sign.nameZh,
          degreeInSign: Number(AngleMath.degreeInSign(house.cuspLongitude).toFixed(4)),
        };
      });
  },

  /**
   * Assign a house number (1–12) to a longitude given 12 ordered cusps. Used for
   * derived charts (composite/Davison) where the adapter cannot supply houses.
   */
  houseForLongitude(longitude, houses) {
    const lon = AngleMath.normalize(longitude);
    const sorted = houses.slice().sort((a, b) => a.index - b.index);
    for (let i = 0; i < sorted.length; i += 1) {
      const start = AngleMath.normalize(sorted[i].cuspLongitude);
      const end = AngleMath.normalize(sorted[(i + 1) % sorted.length].cuspLongitude);
      const span = AngleMath.normalize(end - start);
      const offset = AngleMath.normalize(lon - start);
      if (offset < span || span === 0) return sorted[i].index;
    }
    return sorted[0].index;
  },

  /**
   * Element/modality distribution from a ring's physical bodies (weighting each
   * body equally). Returns counts keyed by element/modality token.
   */
  distributions(points) {
    const elements = { fire: 0, earth: 0, air: 0, water: 0 };
    const modalities = { cardinal: 0, fixed: 0, mutable: 0 };
    for (const point of points) {
      if (point.kind !== 'body') continue;
      const sign = ZODIAC_SIGNS[point.signIndex];
      if (!sign) continue;
      elements[sign.element] += 1;
      modalities[sign.modality] += 1;
    }
    return { elements, modalities };
  },
};

module.exports = ChartData;

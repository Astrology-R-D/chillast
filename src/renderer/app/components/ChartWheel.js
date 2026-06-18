// ChartWheel.js — renders a professional astrological wheel as inline SVG.
//
// It supports single-ring charts (natal, returns, composite, davison) and
// bi-wheel charts (transit, progressed, synastry) where a second ring of points
// surrounds the first. The wheel is oriented the traditional way: the Ascendant
// sits on the left (west) and the zodiac increases counter-clockwise.
//
// Rendering is intentionally pure: given chart data + reference signs it returns
// an SVG string, so it has no dependency on the DOM lifecycle and is trivial to
// snapshot-test.

const SIZE = 740;
const CX = SIZE / 2;
const CY = SIZE / 2;

// Concentric radii (px from centre).
const R = {
  zodiacOuter: 352,
  zodiacInner: 300,
  tick: 292,           // minor degree ticks reach inward to here
  houseOuter: 300,
  hub: 150,            // aspect hub boundary / inner house-line end
  houseNumber: 168,
};

// Planet ring radii depend on whether the chart is single or bi-wheel.
const PLANET_RADIUS = {
  single: 262,
  inner: 232,
  outer: 280,
};

const ASPECT_CLASS = {
  conjunction: 'conjunction',
  opposition: 'tension', square: 'tension',
  trine: 'harmonic', sextile: 'harmonic',
};

const ASPECT_COLOR = {
  conjunction: '#d9b25b',
  harmonic: '#5bd6a0',
  tension: '#e06a78',
  minor: '#8a82b0',
};

const ELEMENT_COLOR = {
  fire: '#e8714a', earth: '#c2a36a', air: '#6fb6e8', water: '#6f78e8',
};

export class ChartWheel {
  /**
   * @param {object} reference referenceData() payload (needs `.signs`).
   */
  constructor(reference) {
    this.signs = reference.signs;
  }

  /** Render the wheel for a chart into `container` (innerHTML). */
  render(container, chart) {
    container.innerHTML = this.toSvg(chart);
  }

  /** @returns {string} the full SVG markup for a chart. */
  toSvg(chart) {
    const rotation = chart.angles && chart.angles.ascendant
      ? chart.angles.ascendant.longitude : 0;
    const ctx = { rotation };

    const layers = [
      this._zodiacBand(ctx),
      this._degreeTicks(ctx),
      this._houseLines(chart, ctx),
      this._aspects(chart, ctx),
      this._angleMarkers(chart, ctx),
      this._planetRings(chart, ctx),
      this._hub(),
    ];

    return `<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg" role="img">${layers.join('')}</svg>`;
  }

  // —— geometry ————————————————————————————————————————————————

  /** Map an ecliptic longitude to screen coordinates at radius `r`. */
  _polar(r, longitude, rotation) {
    const theta = (180 + (longitude - rotation)) * Math.PI / 180;
    return { x: CX + r * Math.cos(theta), y: CY - r * Math.sin(theta) };
  }

  // —— layers ——————————————————————————————————————————————————

  _zodiacBand(ctx) {
    let out = '';
    // base rings
    out += circle(CX, CY, R.zodiacOuter, 'fill:none;stroke:rgba(180,160,235,0.35);stroke-width:1.5');
    out += circle(CX, CY, R.zodiacInner, 'fill:none;stroke:rgba(180,160,235,0.25);stroke-width:1');

    for (let i = 0; i < 12; i += 1) {
      const sign = this.signs[i];
      const a0 = i * 30;
      const a1 = a0 + 30;
      // tinted sector
      out += this._sector(R.zodiacInner, R.zodiacOuter, a0, a1, ctx.rotation,
        `fill:${ELEMENT_COLOR[sign.element]};fill-opacity:0.12;stroke:none`);
      // divider line
      const p = this._polar(R.zodiacOuter, a0, ctx.rotation);
      const pin = this._polar(R.hub, a0, ctx.rotation);
      out += line(pin.x, pin.y, p.x, p.y, 'stroke:rgba(150,132,220,0.10);stroke-width:1');
      // sign glyph
      const c = this._polar((R.zodiacInner + R.zodiacOuter) / 2, a0 + 15, ctx.rotation);
      out += text(c.x, c.y, sign.glyph, `fill:${ELEMENT_COLOR[sign.element]};font-size:24px`, 'svg-glyph');
    }
    return out;
  }

  _degreeTicks(ctx) {
    let out = '';
    for (let d = 0; d < 360; d += 5) {
      const long = d % 10 === 0 ? 9 : 5;
      const p1 = this._polar(R.zodiacInner, d, ctx.rotation);
      const p2 = this._polar(R.zodiacInner - long, d, ctx.rotation);
      out += line(p1.x, p1.y, p2.x, p2.y, 'stroke:rgba(180,160,235,0.30);stroke-width:1');
    }
    return out;
  }

  _houseLines(chart, ctx) {
    const houses = chart.houses || [];
    if (!houses.length) return '';
    let out = '';
    for (let i = 0; i < houses.length; i += 1) {
      const cusp = houses[i];
      const inner = this._polar(R.hub, cusp.cuspLongitude, ctx.rotation);
      const outer = this._polar(R.houseOuter, cusp.cuspLongitude, ctx.rotation);
      const isAngle = [1, 4, 7, 10].includes(cusp.index);
      out += line(inner.x, inner.y, outer.x, outer.y,
        `stroke:rgba(180,160,235,${isAngle ? 0.45 : 0.18});stroke-width:${isAngle ? 1.4 : 1}`);
      // house number placed at the midpoint of the house arc.
      const next = houses[(i + 1) % houses.length];
      const mid = midLongitude(cusp.cuspLongitude, next.cuspLongitude);
      const np = this._polar(R.houseNumber, mid, ctx.rotation);
      out += text(np.x, np.y, String(cusp.index),
        'fill:rgba(179,170,214,0.65);font-size:12px');
    }
    return out;
  }

  _angleMarkers(chart, ctx) {
    const angles = chart.angles || {};
    const labels = { ascendant: 'Asc', midheaven: 'MC', descendant: 'Dsc', imumcoeli: 'IC' };
    let out = '';
    for (const [key, label] of Object.entries(labels)) {
      const a = angles[key];
      if (!a) continue;
      const inner = this._polar(R.hub, a.longitude, ctx.rotation);
      const outer = this._polar(R.zodiacOuter + 0, a.longitude, ctx.rotation);
      out += line(inner.x, inner.y, outer.x, outer.y, 'stroke:#d9b25b;stroke-width:1.6;stroke-dasharray:none');
      const lp = this._polar(R.zodiacOuter + 14, a.longitude, ctx.rotation);
      out += text(lp.x, lp.y, label, 'fill:#f0cd7a;font-size:12px;font-weight:600');
    }
    return out;
  }

  _aspects(chart, ctx) {
    const aspects = chart.aspects || [];
    if (!aspects.length) return '';
    // Build a key→longitude lookup per ring so cross-aspects resolve correctly.
    const rings = chart.rings || [];
    const ring0 = new Map((rings[0] ? rings[0].points : []).map((p) => [p.key, p]));
    const ring1 = new Map((rings[1] ? rings[1].points : []).map((p) => [p.key, p]));
    const isBiWheel = rings.length > 1;

    let out = '';
    for (const asp of aspects) {
      const p1 = ring0.get(asp.point1) || ring1.get(asp.point1);
      const p2 = isBiWheel
        ? (ring1.get(asp.point2) || ring0.get(asp.point2))
        : (ring0.get(asp.point2) || ring1.get(asp.point2));
      if (!p1 || !p2) continue;
      const a = this._polar(R.hub - 2, p1.longitude, ctx.rotation);
      const b = this._polar(R.hub - 2, p2.longitude, ctx.rotation);
      const klass = ASPECT_CLASS[asp.aspectKey] || 'minor';
      const color = ASPECT_COLOR[klass] || ASPECT_COLOR.minor;
      const opacity = (0.25 + 0.55 * (asp.strength || 0)).toFixed(2);
      const width = klass === 'minor' ? 0.8 : 1.4;
      const dash = klass === 'minor' ? 'stroke-dasharray:3 3;' : '';
      out += line(a.x, a.y, b.x, b.y,
        `stroke:${color};stroke-width:${width};stroke-opacity:${opacity};${dash}`);
    }
    return out;
  }

  _planetRings(chart, ctx) {
    const rings = chart.rings || [];
    let out = '';
    if (rings.length <= 1) {
      out += this._planets(rings[0] ? rings[0].points : [], PLANET_RADIUS.single, ctx, 'primary');
    } else {
      out += this._planets(rings[0].points, PLANET_RADIUS.inner, ctx, 'inner');
      out += this._planets(rings[1].points, PLANET_RADIUS.outer, ctx, 'outer');
    }
    return out;
  }

  _planets(points, radius, ctx, ringRole) {
    if (!points || !points.length) return '';
    const plotted = points.filter((p) => p.kind === 'body' || p.kind === 'point');
    const display = spreadAngles(plotted.map((p) => p.longitude), 9);
    const ringColor = ringRole === 'outer' ? '#f0cd7a' : '#ece9ff';

    let out = '';
    plotted.forEach((p, i) => {
      const trueP = this._polar(R.zodiacInner - 4, p.longitude, ctx.rotation);
      const dispLong = display[i];
      const glyphPos = this._polar(radius, dispLong, ctx.rotation);
      // leader from true degree to (possibly spread) glyph
      const leadStart = this._polar(R.zodiacInner - 6, p.longitude, ctx.rotation);
      const leadEnd = this._polar(radius + 13, dispLong, ctx.rotation);
      out += line(leadStart.x, leadStart.y, leadEnd.x, leadEnd.y,
        'stroke:rgba(179,170,214,0.35);stroke-width:0.8');
      out += `<circle cx="${trueP.x.toFixed(1)}" cy="${trueP.y.toFixed(1)}" r="1.6" style="fill:${ringColor};opacity:0.7"/>`;
      // glyph
      out += text(glyphPos.x, glyphPos.y, p.glyph,
        `fill:${ringColor};font-size:20px`, 'svg-glyph');
      // degree label
      const degPos = this._polar(radius - 16, dispLong, ctx.rotation);
      const label = `${Math.floor(p.degreeInSign)}°${p.retrograde ? ' ℞' : ''}`;
      out += text(degPos.x, degPos.y, label,
        `fill:${p.retrograde ? '#e06a78' : 'rgba(179,170,214,0.8)'};font-size:9px`);
    });
    return out;
  }

  _hub() {
    return circle(CX, CY, R.hub, 'fill:rgba(8,7,16,0.35);stroke:rgba(180,160,235,0.25);stroke-width:1');
  }

  /** Annular-sector path used for the tinted zodiac band. */
  _sector(ri, ro, a0, a1, rotation, style) {
    const p1 = this._polar(ro, a0, rotation);
    const p2 = this._polar(ro, a1, rotation);
    const p3 = this._polar(ri, a1, rotation);
    const p4 = this._polar(ri, a0, rotation);
    const d = [
      `M ${f(p1.x)} ${f(p1.y)}`,
      `A ${ro} ${ro} 0 0 0 ${f(p2.x)} ${f(p2.y)}`,
      `L ${f(p3.x)} ${f(p3.y)}`,
      `A ${ri} ${ri} 0 0 1 ${f(p4.x)} ${f(p4.y)}`,
      'Z',
    ].join(' ');
    return `<path d="${d}" style="${style}"/>`;
  }
}

// —— small SVG string helpers ————————————————————————————————————

function f(n) { return n.toFixed(2); }

function circle(cx, cy, r, style) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" style="${style}"/>`;
}

function line(x1, y1, x2, y2, style) {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" style="${style}"/>`;
}

function text(x, y, content, style, className = '') {
  return `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" class="${className}" style="${style}">${escapeXml(content)}</text>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

/** Circular midpoint of two longitudes along the shortest arc. */
function midLongitude(a, b) {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return ((a + d / 2) % 360 + 360) % 360;
}

/**
 * Spread a set of longitudes so adjacent glyphs keep at least `minSep` degrees,
 * preserving order. Returns display longitudes parallel to the input array.
 */
function spreadAngles(longitudes, minSep) {
  const order = longitudes
    .map((lon, idx) => ({ lon: ((lon % 360) + 360) % 360, idx }))
    .sort((a, b) => a.lon - b.lon);

  const disp = order.map((o) => o.lon);
  const n = disp.length;
  if (n > 1) {
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 1; i < n; i += 1) {
        const gap = disp[i] - disp[i - 1];
        if (gap < minSep) disp[i] = disp[i - 1] + minSep;
      }
      // wrap correction between last and first
      const wrapGap = disp[0] + 360 - disp[n - 1];
      if (wrapGap < minSep) {
        const shift = (minSep - wrapGap) / 2;
        disp[0] += shift;
        for (let i = 1; i < n; i += 1) {
          if (disp[i] - disp[i - 1] < minSep) disp[i] = disp[i - 1] + minSep;
        }
      }
    }
  }

  const result = new Array(longitudes.length);
  order.forEach((o, i) => { result[o.idx] = disp[i] % 360; });
  return result;
}

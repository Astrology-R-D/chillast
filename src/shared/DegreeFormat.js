'use strict';

/** Display decimal degrees at minute precision, without rounding into the next minute/sign. */
function formatDegreeMinutes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const totalMinutes = Math.floor(Math.abs(value) * 60 + 1e-7);
  const sign = value < 0 && totalMinutes !== 0 ? '−' : '';
  return `${sign}${Math.floor(totalMinutes / 60)}°${String(totalMinutes % 60).padStart(2, '0')}′`;
}

module.exports = { formatDegreeMinutes };

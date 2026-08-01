'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DateTime } = require('luxon');
const LocationResolver = require('../src/core/astrology/LocationResolver');

const resolver = new LocationResolver();

test('resolves IANA zones and historical offsets without network access', () => {
  const summer = resolver.resolve({ year: 2024, month: 7, day: 1, hour: 12, minute: 0, latitude: 40.7128, longitude: -74.006 });
  const winter = resolver.resolve({ year: 2024, month: 1, day: 1, hour: 12, minute: 0, latitude: 40.7128, longitude: -74.006 });
  const beijing = resolver.resolve({ year: 1948, month: 12, day: 1, hour: 12, minute: 0, latitude: 39.9042, longitude: 116.4074 });

  assert.deepEqual(summer, {
    timeZone: 'America/New_York', utcOffsetMinutes: -240, utcOffsetLabel: 'UTC-04:00', instantUtc: '2024-07-01T16:00:00.000Z',
  });
  assert.equal(winter.utcOffsetMinutes, -300);
  assert.equal(winter.utcOffsetLabel, 'UTC-05:00');
  assert.equal(beijing.timeZone, 'Asia/Shanghai');
  assert.equal(beijing.utcOffsetMinutes, 480);
});

test('matches the existing chart conversion for ambiguous fall-back local times', () => {
  const input = { year: 2024, month: 11, day: 3, hour: 1, minute: 30, latitude: 40.7128, longitude: -74.006 };
  const result = resolver.resolve(input);
  const { year, month, day, hour, minute } = input;
  const chartInstant = DateTime.fromObject({ year, month, day, hour, minute }, { zone: 'America/New_York' }).toUTC().toISO();

  assert.equal(result.instantUtc, chartInstant);
  assert.equal(result.utcOffsetMinutes, -240, 'Luxon/chart casting selects the earlier EDT occurrence');
});

test('accepts valid civil years below 100 without JavaScript Date remapping', () => {
  const result = resolver.resolve({ year: 50, month: 1, day: 1, hour: 0, minute: 0, latitude: 0, longitude: 0 });
  assert.equal(result.timeZone, 'Etc/GMT');
  assert.match(result.instantUtc, /^0050-01-01T00:00:00/);
});

for (const [input, message] of [
  [{ year: 2024, month: 2, day: 30, hour: 1, minute: 0, latitude: 0, longitude: 0 }, /date|日期/i],
  [{ year: 2024, month: 1.5, day: 1, hour: 1, minute: 0, latitude: 0, longitude: 0 }, /integer|整数/i],
  [{ year: 3001, month: 1, day: 1, hour: 1, minute: 0, latitude: 0, longitude: 0 }, /year|range/i],
  [{ year: 2024, month: 1, day: 1, hour: 1, minute: 0, latitude: 91, longitude: 0 }, /latitude|纬度/i],
  [{ year: 2024, month: 1, day: 1, hour: 1, minute: 0, latitude: 0, longitude: Infinity }, /longitude|经度/i],
  [{ year: 2024, month: 3, day: 10, hour: 2, minute: 30, latitude: 40.7128, longitude: -74.006 }, /nonexistent|不存在/i],
]) {
  test(`rejects invalid location resolution input: ${JSON.stringify(input)}`, () => {
    assert.throws(() => resolver.resolve(input), message);
  });
}

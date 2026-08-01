'use strict';

const { DateTime } = require('luxon');
const tzlookup = require('tz-lookup');

class LocationResolver {
  resolve(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Location resolution input must be an object');
    }

    const fields = ['year', 'month', 'day', 'hour', 'minute'];
    for (const field of fields) {
      if (!Number.isFinite(input[field]) || !Number.isInteger(input[field])) {
        throw new Error(`${field} must be a finite integer`);
      }
    }
    const ranges = { year: [1, 3000], month: [1, 12], day: [1, 31], hour: [0, 23], minute: [0, 59] };
    for (const [field, [minimum, maximum]] of Object.entries(ranges)) {
      if (input[field] < minimum || input[field] > maximum) {
        throw new Error(`${field} is outside its valid range`);
      }
    }
    if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
      throw new Error('latitude must be finite and between -90 and 90');
    }
    if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
      throw new Error('longitude must be finite and between -180 and 180');
    }

    const civil = Object.fromEntries(fields.map((field) => [field, input[field]]));
    if (!DateTime.fromObject(civil, { zone: 'utc' }).isValid) {
      throw new Error('The civil date does not exist');
    }

    const timeZone = tzlookup(input.latitude, input.longitude);
    const local = DateTime.fromObject(civil, { zone: timeZone });
    if (!local.isValid) throw new Error(`Invalid local date and time: ${local.invalidExplanation || local.invalidReason}`);
    if (fields.some((field) => local[field] !== input[field])) {
      throw new Error('The local time is nonexistent because of a daylight-saving transition');
    }

    const sign = local.offset >= 0 ? '+' : '-';
    const absoluteOffset = Math.abs(local.offset);
    const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
    const minutes = String(absoluteOffset % 60).padStart(2, '0');
    return {
      timeZone,
      utcOffsetMinutes: local.offset,
      utcOffsetLabel: `UTC${sign}${hours}:${minutes}`,
      instantUtc: local.toUTC().toISO(),
    };
  }
}

module.exports = LocationResolver;

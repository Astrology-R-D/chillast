import { describe, expect, test } from 'vitest';
import type { Profile } from '../../api/contracts';
import {
  profileDisplayName,
  selectDirectoryProfiles,
  type DirectoryQuery,
  type ProfileRecents,
} from './directory';

const NOW = Date.parse('2026-08-02T12:00:00.000Z');

function profile(id: string, overrides: Partial<Profile> = {}): Profile {
  return {
    id,
    nameZh: `姓名${id}`,
    nameEn: `Name ${id}`,
    gender: 'other',
    birthData: {
      year: 1990,
      month: 1,
      day: 2,
      hour: 3,
      minute: 4,
      location: { label: '上海 China', latitude: 31.23, longitude: 121.47 },
    },
    notes: 'Astrology client',
    tags: ['vip', 'returning'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function query(overrides: Partial<DirectoryQuery> = {}): DirectoryQuery {
  return { search: '', recent: 'all', sort: 'updated-desc', ...overrides };
}

function ids(profiles: Profile[]): string[] {
  return profiles.map(({ id }) => id);
}

describe('profileDisplayName', () => {
  test('prefers a trimmed Chinese name and falls back to English or empty text', () => {
    expect(profileDisplayName(profile('a', { nameZh: '  王芳  ', nameEn: 'Fang Wang' }))).toBe('王芳');
    expect(profileDisplayName(profile('b', { nameZh: '', nameEn: '  Jane Doe  ' }))).toBe('Jane Doe');
    expect(profileDisplayName(profile('c', { nameZh: null, nameEn: undefined } as unknown as Partial<Profile>))).toBe('');
  });
});

describe('selectDirectoryProfiles search', () => {
  const bilingual = profile('bilingual', {
    nameZh: '王小明',
    nameEn: 'Alice Chen',
    birthData: {
      year: 1990,
      month: 1,
      day: 2,
      hour: 3,
      minute: 4,
      location: { label: '北京 Beijing', latitude: 39.9, longitude: 116.4 },
    },
    tags: ['ＶＩＰ', '事业'],
    notes: 'Annual consultation',
  });

  test.each(['王小明', 'ALICE', 'chen', 'ａｌｉｃｅ'])('matches bilingual names with normalized case and width: %s', (search) => {
    expect(ids(selectDirectoryProfiles([bilingual], query({ search }), {}, NOW))).toEqual(['bilingual']);
  });

  test.each([
    ['STRASSE', 'Straße'],
    ['ΟΣ', 'ος'],
    ['ΟΣ', 'οσ'],
    ['i\u0307', 'İ'],
    ['fullwidth', 'ＦＵＬＬＷＩＤＴＨ'],
  ])('applies Unicode 17 default folding to %s and %s', (search, nameEn) => {
    const candidate = profile('folded', { nameZh: '', nameEn });
    expect(ids(selectDirectoryProfiles([candidate], query({ search }), {}, NOW))).toEqual(['folded']);
  });

  test('keeps dotted capital I distinct from plain I under default folding', () => {
    const profiles = [
      profile('dotted', { nameZh: '', nameEn: 'İ' }),
      profile('plain', { nameZh: '', nameEn: 'I' }),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ search: 'i\u0307' }), {}, NOW))).toEqual(['dotted']);
  });

  test('requires every token while allowing tokens to match across fields', () => {
    expect(ids(selectDirectoryProfiles([bilingual], query({ search: ' Alice   北京 事业 consultation ' }), {}, NOW))).toEqual(['bilingual']);
    expect(selectDirectoryProfiles([bilingual], query({ search: 'Alice missing' }), {}, NOW)).toEqual([]);
  });

  test.each(['vip', '事业', 'beijing', 'annual'])('searches tags, notes, and location labels: %s', (search) => {
    expect(ids(selectDirectoryProfiles([bilingual], query({ search }), {}, NOW))).toEqual(['bilingual']);
  });

  test('treats collapsed whitespace as empty and handles malformed optional text', () => {
    const malformed = profile('malformed', {
      nameZh: null,
      nameEn: undefined,
      notes: null,
      tags: [null, 'Valid Tag'],
      birthData: {
        year: 1990,
        month: 1,
        day: 2,
        hour: 3,
        minute: 4,
        location: { label: undefined, latitude: 0, longitude: 0 },
      },
    } as unknown as Partial<Profile>);

    expect(ids(selectDirectoryProfiles([malformed], query({ search: '\t\n　' }), {}, NOW))).toEqual(['malformed']);
    expect(ids(selectDirectoryProfiles([malformed], query({ search: 'valid tag' }), {}, NOW))).toEqual(['malformed']);
  });

  test('does not search numeric coordinates and returns no results when unmatched', () => {
    expect(selectDirectoryProfiles([bilingual], query({ search: '39.9' }), {}, NOW)).toEqual([]);
    expect(selectDirectoryProfiles([], query({ search: 'alice' }), {}, NOW)).toEqual([]);
  });

  test('never mutates the profiles, tags, query, or recents inputs', () => {
    const profiles = [profile('b', { tags: ['second'] }), profile('a', { tags: ['first'] })];
    const originalOrder = [...profiles];
    const originalTags = profiles.map((item) => [...item.tags]);
    const inputQuery = query({ search: 'name', sort: 'name-asc' });
    const recents = { a: NOW };

    selectDirectoryProfiles(profiles, inputQuery, recents, NOW);

    expect(profiles).toEqual(originalOrder);
    expect(profiles.map((item) => item.tags)).toEqual(originalTags);
    expect(inputQuery).toEqual(query({ search: 'name', sort: 'name-asc' }));
    expect(recents).toEqual({ a: NOW });
  });
});

describe('selectDirectoryProfiles recent filters', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const profiles = ['seven', 'thirty', 'inside', 'old', 'future', 'nan', 'unused'].map((id) => profile(id));
  const recents: ProfileRecents = {
    seven: NOW - 7 * DAY,
    thirty: NOW - 30 * DAY,
    inside: NOW - DAY,
    old: NOW - 30 * DAY - 1,
    future: NOW + 1,
    nan: Number.NaN,
  };

  test('includes the exact seven-day boundary and rejects invalid uses', () => {
    expect(ids(selectDirectoryProfiles(profiles, query({ recent: '7d' }), recents, NOW)).sort()).toEqual(['inside', 'seven']);
  });

  test('includes the exact thirty-day boundary and excludes one millisecond older', () => {
    expect(ids(selectDirectoryProfiles(profiles, query({ recent: '30d' }), recents, NOW)).sort()).toEqual(['inside', 'seven', 'thirty'].sort());
  });

  test('does not let malformed recents affect the all filter', () => {
    expect(selectDirectoryProfiles(profiles, query({ recent: 'all' }), recents, NOW)).toHaveLength(profiles.length);
  });
});

describe('selectDirectoryProfiles sorting', () => {
  test('sorts canonical zoned timestamps descending with exact-now and offset ties', () => {
    const profiles = [
      profile('invalid', { updatedAt: 'not-a-date' }),
      profile('older', { updatedAt: '2026-06-01T00:00:00.000Z' }),
      profile('future', { updatedAt: '2026-08-03T00:00:00.000Z' }),
      profile('invalid-calendar', { updatedAt: '2026-02-30T00:00:00.000Z' }),
      profile('now-utc', { updatedAt: '2026-08-02T12:00:00.000Z' }),
      profile('now-offset', { updatedAt: '2026-08-02T20:00:00+08:00' }),
      profile('missing', { updatedAt: undefined } as unknown as Partial<Profile>),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'updated-desc' }), {}, NOW))).toEqual([
      'now-offset', 'now-utc', 'older', 'future', 'invalid', 'invalid-calendar', 'missing',
    ]);
  });

  test('rejects non-canonical, invalid-clock, and invalid-offset updated timestamps', () => {
    const profiles = [
      profile('valid', { updatedAt: '2026-07-01T01:02:03Z' }),
      profile('date-only', { updatedAt: '2026-07-01' }),
      profile('no-seconds', { updatedAt: '2026-07-01T01:02Z' }),
      profile('hour-24', { updatedAt: '2026-07-01T24:00:00Z' }),
      profile('second-60', { updatedAt: '2026-07-01T01:02:60Z' }),
      profile('offset-hour', { updatedAt: '2026-07-01T01:02:03+24:00' }),
      profile('offset-minute', { updatedAt: '2026-07-01T01:02:03+01:60' }),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'updated-desc' }), {}, NOW))).toEqual([
      'valid', 'date-only', 'hour-24', 'no-seconds', 'offset-hour', 'offset-minute', 'second-60',
    ]);
  });

  test('sorts names by NFKC default-folded lexical keys and resolves equal keys by ID', () => {
    const profiles = [
      profile('empty', { nameZh: '', nameEn: '' }),
      profile('strasse-b', { nameZh: '', nameEn: 'Straße' }),
      profile('strasse-a', { nameZh: '', nameEn: 'STRASSE' }),
      profile('width', { nameZh: '', nameEn: 'Ａlpha' }),
      profile('wang', { nameZh: '王芳', nameEn: 'Zulu' }),
      profile('fallback', { nameZh: '', nameEn: 'Alice' }),
      profile('missing', { nameZh: undefined, nameEn: null } as unknown as Partial<Profile>),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'name-asc' }), {}, NOW))).toEqual([
      'empty', 'missing', 'fallback', 'width', 'strasse-a', 'strasse-b', 'wang',
    ]);
  });

  test('sorts birth fields numerically from year through minute and resolves exact ties by ID', () => {
    const profiles = [
      profile('minute', { birthData: { ...profile('x').birthData, minute: 5 } }),
      profile('year', { birthData: { ...profile('x').birthData, year: 1989 } }),
      profile('tie-b'),
      profile('hour', { birthData: { ...profile('x').birthData, hour: 2 } }),
      profile('day', { birthData: { ...profile('x').birthData, day: 1 } }),
      profile('month', { birthData: { ...profile('x').birthData, month: 2 } }),
      profile('tie-a'),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'birth-asc' }), {}, NOW))).toEqual([
      'year', 'day', 'hour', 'tie-a', 'tie-b', 'minute', 'month',
    ]);
  });

  test('accepts birth domain boundaries and puts malformed values last by ID', () => {
    const profiles = [
      profile('max', { birthData: { ...profile('x').birthData, year: 3000, month: 12, day: 31, hour: 23, minute: 59 } }),
      profile('leap', { birthData: { ...profile('x').birthData, year: 2000, month: 2, day: 29, hour: 12, minute: 30 } }),
      profile('min', { birthData: { ...profile('x').birthData, year: 1, month: 1, day: 1, hour: 0, minute: 0 } }),
      profile('day', { birthData: { ...profile('x').birthData, month: 2, day: 30 } }),
      profile('float', { birthData: { ...profile('x').birthData, minute: 1.5 } }),
      profile('hour', { birthData: { ...profile('x').birthData, hour: 24 } }),
      profile('minute', { birthData: { ...profile('x').birthData, minute: 60 } }),
      profile('missing', { birthData: undefined } as unknown as Partial<Profile>),
      profile('month', { birthData: { ...profile('x').birthData, month: 0 } }),
      profile('nan', { birthData: { ...profile('x').birthData, year: Number.NaN } }),
      profile('year-high', { birthData: { ...profile('x').birthData, year: 3001 } }),
      profile('year-low', { birthData: { ...profile('x').birthData, year: 0 } }),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'birth-asc' }), {}, NOW))).toEqual([
      'min', 'leap', 'max', 'day', 'float', 'hour', 'minute', 'missing', 'month', 'nan', 'year-high', 'year-low',
    ]);
  });

  test('sorts valid recent uses descending and puts future, NaN, and unused IDs last deterministically', () => {
    const profiles = ['unused', 'same-b', 'future', 'latest', 'nan', 'same-a'].map((id) => profile(id));
    const recents = {
      latest: NOW,
      'same-a': NOW - 10,
      'same-b': NOW - 10,
      future: NOW + 1,
      nan: Number.NaN,
    };

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'recent-desc' }), recents, NOW))).toEqual([
      'latest', 'same-a', 'same-b', 'future', 'nan', 'unused',
    ]);
  });

  test.each(['updated-desc', 'name-asc', 'birth-asc', 'recent-desc'] as const)('returns identical ordering across repeated %s calls', (sort) => {
    const profiles = [profile('c'), profile('a'), profile('b')];
    const recents = { a: NOW - 1, b: NOW - 1 };
    const first = ids(selectDirectoryProfiles(profiles, query({ sort }), recents, NOW));

    expect(ids(selectDirectoryProfiles(profiles, query({ sort }), recents, NOW))).toEqual(first);
  });
});

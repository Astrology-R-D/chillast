import { describe, expect, test } from 'vitest';
import type { Profile } from '../../api/contracts';
import {
  profileDisplayName,
  selectDirectoryProfiles,
  type DirectoryQuery,
  type RecentUses,
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
  const recents: RecentUses = {
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
  test('sorts updated timestamps descending with future, malformed, and missing values last', () => {
    const profiles = [
      profile('invalid', { updatedAt: 'not-a-date' }),
      profile('older', { updatedAt: '2026-06-01T00:00:00.000Z' }),
      profile('future', { updatedAt: '2026-08-03T00:00:00.000Z' }),
      profile('invalid-calendar', { updatedAt: '2026-02-30T00:00:00.000Z' }),
      profile('newer-b', { updatedAt: '2026-08-01T00:00:00.000Z' }),
      profile('newer-a', { updatedAt: '2026-08-01T00:00:00.000Z' }),
      profile('missing', { updatedAt: undefined } as unknown as Partial<Profile>),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'updated-desc' }), {}, NOW))).toEqual([
      'newer-a', 'newer-b', 'older', 'future', 'invalid', 'invalid-calendar', 'missing',
    ]);
  });

  test('sorts preferred and fallback names with a fixed Chinese-aware collator and ID ties', () => {
    const profiles = [
      profile('empty', { nameZh: '', nameEn: '' }),
      profile('li-b', { nameZh: '李雷', nameEn: 'Zulu' }),
      profile('wang', { nameZh: '王芳', nameEn: 'Alpha' }),
      profile('fallback', { nameZh: '', nameEn: 'Alice' }),
      profile('li-a', { nameZh: '李雷', nameEn: 'Echo' }),
      profile('missing', { nameZh: undefined, nameEn: null } as unknown as Partial<Profile>),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'name-asc' }), {}, NOW))).toEqual([
      'empty', 'missing', 'li-a', 'li-b', 'wang', 'fallback',
    ]);
  });

  test('sorts birth fields numerically from year through minute and resolves exact ties by ID', () => {
    const profiles = [
      profile('minute', { birthData: { ...profile('x').birthData, minute: 5 } }),
      profile('year', { birthData: { ...profile('x').birthData, year: 1989 } }),
      profile('tie-b'),
      profile('hour', { birthData: { ...profile('x').birthData, hour: 2 } }),
      profile('day', { birthData: { ...profile('x').birthData, day: 1 } }),
      profile('month', { birthData: { ...profile('x').birthData, month: 0 } }),
      profile('tie-a'),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'birth-asc' }), {}, NOW))).toEqual([
      'year', 'month', 'day', 'hour', 'tie-a', 'tie-b', 'minute',
    ]);
  });

  test('puts malformed and missing birth data last with deterministic ID ties', () => {
    const profiles = [
      profile('nan', { birthData: { ...profile('x').birthData, year: Number.NaN } }),
      profile('valid'),
      profile('missing', { birthData: undefined } as unknown as Partial<Profile>),
    ];

    expect(ids(selectDirectoryProfiles(profiles, query({ sort: 'birth-asc' }), {}, NOW))).toEqual([
      'valid', 'missing', 'nan',
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

import { describe, expect, test } from 'vitest';
import type { Profile } from '../../api/contracts';
import { emptyDraft, isProfileDraftDirty, parseTagText, profileToDraft, validateProfileDraft } from './profileForm';

const profile: Profile = {
  id: 'profile-1', nameZh: ' 王晓明 ', nameEn: '', gender: 'male',
  birthData: { year: 2000, month: 2, day: 29, hour: 8, minute: 5, location: { label: ' 北京 ', latitude: 39.9, longitude: 116.4 } },
  notes: 'note', tags: ['贵宾'], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
};

test('creates string drafts and preserves edit identity metadata', () => {
  expect(emptyDraft()).toMatchObject({ year: '', month: '', day: '', hour: '', minute: '', latitude: '', longitude: '', gender: 'female' });
  expect(profileToDraft(profile)).toMatchObject({ id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt, year: '2000', minute: '5', latitude: '39.9' });
});

describe('parseTagText', () => {
  test('normalizes separators, NFC, whitespace, and duplicate casing', () => {
    expect(parseTagText('  VIP，vip\n Cafe\u0301,事业 ')).toEqual(['VIP', 'Café', '事业']);
  });

  test('applies the domain tag count and code point limits', () => {
    const tags = Array.from({ length: 22 }, (_, index) => `tag-${index}`).join(',');
    expect(parseTagText(`${'x'.repeat(33)},${tags}`)).toHaveLength(20);
    expect(parseTagText(`${'x'.repeat(33)},ok`)).toEqual(['ok']);
  });
});

test('collects deterministic errors without accepting blanks, decimals, or impossible dates', () => {
  const result = validateProfileDraft({ ...emptyDraft(), gender: 'invalid', year: '2023', month: '2', day: '29', hour: '1.5', minute: '', locationLabel: ' ', latitude: 'Infinity', longitude: '181', tags: 'x'.repeat(33) });
  expect(result).toEqual({ ok: false, errors: {
    nameZh: 'form.errorNameRequired', gender: 'form.errorGender', day: 'form.errorDate', hour: 'form.errorHour', minute: 'form.errorMinute',
    locationLabel: 'form.errorLocationRequired', latitude: 'form.errorLatitude', longitude: 'form.errorLongitude', tags: 'form.errorTags',
  } });
});

test('returns a normalized save input with metadata but no derived timezone', () => {
  const result = validateProfileDraft(profileToDraft(profile));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value).toEqual({
    id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt,
    nameZh: '王晓明', nameEn: '', gender: 'male', notes: 'note', tags: ['贵宾'],
    birthData: { year: 2000, month: 2, day: 29, hour: 8, minute: 5, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  });
  expect(result.value).not.toHaveProperty('timezone');
  expect(result.value.birthData).not.toHaveProperty('timezone');
});

test('canonical dirty comparison ignores harmless whitespace and numeric formatting', () => {
  const initial = profileToDraft(profile);
  expect(isProfileDraftDirty({ ...initial, nameZh: '王晓明', year: '02000', minute: '05', latitude: '39.900', locationLabel: '北京' }, initial)).toBe(false);
  expect(isProfileDraftDirty({ ...initial, notes: 'note ' }, initial)).toBe(true);
});

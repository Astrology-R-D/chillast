import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Gender, Profile } from '../../api/contracts';
import { createDraft, isProfileDraftDirty, parseTagText, toSaveInput, validateProfileDraft } from './profileForm';

const profile: Profile = {
  id: 'profile-1', nameZh: ' 王晓明 ', nameEn: '', gender: 'male',
  birthData: { year: 2000, month: 2, day: 9, hour: 8, minute: 5, location: { label: ' 北京 ', latitude: 39.9, longitude: 116.4 } },
  notes: 'note', tags: ['贵宾'], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
};

afterEach(() => vi.useRealTimers());

test('creates a new draft from the current local year with exact defaults', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2027, 6, 4, 12));
  expect(createDraft(null)).toEqual({
    nameZh: '', nameEn: '', gender: 'other', year: '2027', month: '01', day: '01', hour: '00', minute: '00',
    locationLabel: '', latitude: '', longitude: '', notes: '', tags: '',
  });
});

test('creates a zero-padded edit draft while preserving identity metadata', () => {
  expect(createDraft(profile)).toMatchObject({ id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt, year: '2000', month: '02', day: '09', hour: '08', minute: '05', latitude: '39.9' });
});

describe('parseTagText', () => {
  test('uses Unicode 17 default folding and NFC for duplicate tags', () => {
    expect(parseTagText('Straße，STRASSE\nẞ,ss\nCafe\u0301,Café')).toEqual(['Straße', 'ẞ', 'Café']);
  });

  test('applies the domain tag count and code point limits', () => {
    const tags = Array.from({ length: 22 }, (_, index) => `tag-${index}`).join(',');
    expect(parseTagText(`${'x'.repeat(33)},${tags}`)).toHaveLength(20);
    expect(parseTagText(`${'x'.repeat(33)},ok`)).toEqual(['ok']);
  });

  test('applies the count limit after Unicode-fold duplicate removal', () => {
    const draft = { ...createDraft(profile), tags: Array.from({ length: 21 }, (_, index) => index % 2 ? 'SS' : 'ß').join(',') };
    expect(validateProfileDraft(draft).tags).toBeUndefined();
  });
});

test('collects deterministic Chinese errors without accepting blanks, decimals, or impossible dates', () => {
  const draft = { ...createDraft(null), gender: 'invalid' as Gender, year: '2023', month: '02', day: '29', hour: '1.5', minute: '', locationLabel: ' ', latitude: 'Infinity', longitude: '181', tags: 'x'.repeat(33) };
  expect(validateProfileDraft(draft)).toEqual({
    names: '至少填写中文或英文名字', gender: '请选择有效性别', day: '出生日期不存在', hour: '小时须为 0 至 23 的整数', minute: '分钟须为 0 至 59 的整数',
    locationLabel: '请填写地点名称', latitude: '纬度须为 -90 至 90 的有限数字', longitude: '经度须为 -180 至 180 的有限数字', tags: '最多 20 个标签，每个不超过 32 个字符',
  });
});

test('converts a valid draft to normalized save input without derived timezone', () => {
  const value = toSaveInput(createDraft(profile));
  expect(value).toEqual({
    id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt,
    nameZh: '王晓明', nameEn: '', gender: 'male', notes: 'note', tags: ['贵宾'],
    birthData: { year: 2000, month: 2, day: 9, hour: 8, minute: 5, location: { label: '北京', latitude: 39.9, longitude: 116.4 } },
  });
  expect(value.birthData).not.toHaveProperty('timezone');
});

test('canonical dirty comparison ignores formatting but retains invalid raw tag edits', () => {
  const initial = createDraft(profile);
  expect(isProfileDraftDirty({ ...initial, nameZh: '王晓明', year: '02000', minute: '5', latitude: '39.900', locationLabel: '北京' }, initial)).toBe(false);
  expect(isProfileDraftDirty({ ...initial, tags: 'x'.repeat(33) }, initial)).toBe(true);
});

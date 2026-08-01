import unicodeDefaultCaseFold from '../../../core/util/UnicodeCaseFold';
import type { Gender, Profile, ProfileSaveInput } from '../../api/contracts';

export interface ProfileDraft {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  nameZh: string;
  nameEn: string;
  gender: Gender | string;
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  locationLabel: string;
  latitude: string;
  longitude: string;
  notes: string;
  tags: string;
}

export type FieldErrors = Partial<Record<keyof ProfileDraft, string>>;

const pad = (value: number) => String(value).padStart(2, '0');

export function createDraft(profile: Profile | null): ProfileDraft {
  if (!profile) {
    return {
      nameZh: '', nameEn: '', gender: 'other', year: String(new Date().getFullYear()), month: '01', day: '01', hour: '00', minute: '00',
      locationLabel: '', latitude: '', longitude: '', notes: '', tags: '',
    };
  }
  const { birthData } = profile;
  return {
    id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt,
    nameZh: profile.nameZh, nameEn: profile.nameEn, gender: profile.gender,
    year: String(birthData.year), month: pad(birthData.month), day: pad(birthData.day), hour: pad(birthData.hour), minute: pad(birthData.minute),
    locationLabel: birthData.location.label, latitude: String(birthData.location.latitude), longitude: String(birthData.location.longitude),
    notes: profile.notes, tags: profile.tags.join(', '),
  };
}

export function parseTagText(value: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.split(/[,，\n]/)) {
    const tag = entry.normalize('NFC').trim();
    if (!tag || Array.from(tag).length > 32) continue;
    const key = unicodeDefaultCaseFold(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === 20) break;
  }
  return tags;
}

function integer(value: string, minimum: number, maximum: number): number | null {
  if (!value.trim() || !/^[+-]?\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function finite(value: string, minimum: number, maximum: number): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function validTags(raw: string): boolean {
  const entries = raw.split(/[,，\n]/).map((tag) => tag.normalize('NFC').trim()).filter(Boolean);
  return entries.every((tag) => Array.from(tag).length <= 32)
    && new Set(entries.map(unicodeDefaultCaseFold)).size <= 20;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function validateProfileDraft(draft: ProfileDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.nameZh.trim() && !draft.nameEn.trim()) errors.nameZh = '至少填写中文或英文名字';
  if (!['male', 'female', 'other'].includes(draft.gender)) errors.gender = '请选择有效性别';
  const year = integer(draft.year, 1, 3000);
  const month = integer(draft.month, 1, 12);
  const day = integer(draft.day, 1, 31);
  if (year === null) errors.year = '年份须为 1 至 3000 的整数';
  if (month === null) errors.month = '月份须为 1 至 12 的整数';
  if (day === null) errors.day = '日期须为有效整数';
  if (year !== null && month !== null && day !== null && day > daysInMonth(year, month)) errors.day = '出生日期不存在';
  if (integer(draft.hour, 0, 23) === null) errors.hour = '小时须为 0 至 23 的整数';
  if (integer(draft.minute, 0, 59) === null) errors.minute = '分钟须为 0 至 59 的整数';
  if (!draft.locationLabel.trim()) errors.locationLabel = '请填写地点名称';
  if (finite(draft.latitude, -90, 90) === null) errors.latitude = '纬度须为 -90 至 90 的有限数字';
  if (finite(draft.longitude, -180, 180) === null) errors.longitude = '经度须为 -180 至 180 的有限数字';
  if (!validTags(draft.tags)) errors.tags = '最多 20 个标签，每个不超过 32 个字符';
  return errors;
}

export function toSaveInput(draft: ProfileDraft): ProfileSaveInput {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    ...(draft.createdAt ? { createdAt: draft.createdAt } : {}),
    ...(draft.updatedAt ? { updatedAt: draft.updatedAt } : {}),
    nameZh: draft.nameZh.trim(), nameEn: draft.nameEn.trim(), gender: draft.gender as Gender,
    notes: draft.notes, tags: parseTagText(draft.tags),
    birthData: {
      year: Number(draft.year), month: Number(draft.month), day: Number(draft.day), hour: Number(draft.hour), minute: Number(draft.minute),
      location: { label: draft.locationLabel.trim(), latitude: Number(draft.latitude), longitude: Number(draft.longitude) },
    },
  };
}

function canonicalDraft(draft: ProfileDraft): unknown {
  const errors = validateProfileDraft(draft);
  return {
    ...draft,
    nameZh: draft.nameZh.trim(), nameEn: draft.nameEn.trim(), locationLabel: draft.locationLabel.trim(),
    year: integer(draft.year, 1, 3000) ?? draft.year,
    month: integer(draft.month, 1, 12) ?? draft.month,
    day: integer(draft.day, 1, 31) ?? draft.day,
    hour: integer(draft.hour, 0, 23) ?? draft.hour,
    minute: integer(draft.minute, 0, 59) ?? draft.minute,
    latitude: finite(draft.latitude, -90, 90) ?? draft.latitude,
    longitude: finite(draft.longitude, -180, 180) ?? draft.longitude,
    tags: errors.tags ? draft.tags : parseTagText(draft.tags),
  };
}

export function isProfileDraftDirty(draft: ProfileDraft, initial: ProfileDraft): boolean {
  return JSON.stringify(canonicalDraft(draft)) !== JSON.stringify(canonicalDraft(initial));
}

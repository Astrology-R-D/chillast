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
export type ProfileDraftResult = { ok: true; value: ProfileSaveInput } | { ok: false; errors: FieldErrors };

export function emptyDraft(): ProfileDraft {
  return { nameZh: '', nameEn: '', gender: 'female', year: '', month: '', day: '', hour: '', minute: '', locationLabel: '', latitude: '', longitude: '', notes: '', tags: '' };
}

export function profileToDraft(profile: Profile): ProfileDraft {
  const { birthData } = profile;
  return {
    id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt,
    nameZh: profile.nameZh, nameEn: profile.nameEn, gender: profile.gender,
    year: String(birthData.year), month: String(birthData.month), day: String(birthData.day),
    hour: String(birthData.hour), minute: String(birthData.minute),
    locationLabel: birthData.location.label, latitude: String(birthData.location.latitude), longitude: String(birthData.location.longitude),
    notes: profile.notes, tags: profile.tags.join(', '),
  };
}

const fold = (value: string) => Array.from(value, (character) => character === '\u0131' ? character : character.toUpperCase().toLowerCase()).join('');

export function parseTagText(value: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.split(/[,，\n]/)) {
    const tag = entry.normalize('NFC').trim();
    if (!tag || Array.from(tag).length > 32) continue;
    const key = fold(tag);
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

function tagsValid(raw: string): boolean {
  const entries = raw.split(/[,，\n]/).map((tag) => tag.normalize('NFC').trim()).filter(Boolean);
  return entries.length <= 20 && entries.every((tag) => Array.from(tag).length <= 32);
}

export function validateProfileDraft(draft: ProfileDraft): ProfileDraftResult {
  const errors: FieldErrors = {};
  const nameZh = draft.nameZh.trim();
  const nameEn = draft.nameEn.trim();
  if (!nameZh && !nameEn) errors.nameZh = 'form.errorNameRequired';
  if (!['male', 'female', 'other'].includes(draft.gender)) errors.gender = 'form.errorGender';
  const year = integer(draft.year, 1, 3000);
  const month = integer(draft.month, 1, 12);
  const day = integer(draft.day, 1, 31);
  const hour = integer(draft.hour, 0, 23);
  const minute = integer(draft.minute, 0, 59);
  if (year === null) errors.year = 'form.errorYear';
  if (month === null) errors.month = 'form.errorMonth';
  if (day === null) errors.day = 'form.errorDay';
  if (year !== null && month !== null && day !== null) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > lastDay) errors.day = 'form.errorDate';
  }
  if (hour === null) errors.hour = 'form.errorHour';
  if (minute === null) errors.minute = 'form.errorMinute';
  const locationLabel = draft.locationLabel.trim();
  const latitude = finite(draft.latitude, -90, 90);
  const longitude = finite(draft.longitude, -180, 180);
  if (!locationLabel) errors.locationLabel = 'form.errorLocationRequired';
  if (latitude === null) errors.latitude = 'form.errorLatitude';
  if (longitude === null) errors.longitude = 'form.errorLongitude';
  if (!tagsValid(draft.tags)) errors.tags = 'form.errorTags';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: {
    ...(draft.id ? { id: draft.id } : {}),
    ...(draft.createdAt ? { createdAt: draft.createdAt } : {}),
    ...(draft.updatedAt ? { updatedAt: draft.updatedAt } : {}),
    nameZh, nameEn, gender: draft.gender as Gender, notes: draft.notes, tags: parseTagText(draft.tags),
    birthData: { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, location: { label: locationLabel, latitude: latitude!, longitude: longitude! } },
  } };
}

function canonicalDraft(draft: ProfileDraft): unknown {
  const result = validateProfileDraft(draft);
  if (result.ok) return result.value;
  return { ...draft, nameZh: draft.nameZh.trim(), nameEn: draft.nameEn.trim(), locationLabel: draft.locationLabel.trim(), tags: parseTagText(draft.tags) };
}

export function isProfileDraftDirty(draft: ProfileDraft, initial: ProfileDraft): boolean {
  return JSON.stringify(canonicalDraft(draft)) !== JSON.stringify(canonicalDraft(initial));
}

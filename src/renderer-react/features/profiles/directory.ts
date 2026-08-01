import type { Profile } from '../../api/contracts';
import unicodeDefaultCaseFold from '../../../core/util/UnicodeCaseFold';

export type RecentFilter = 'all' | '7d' | '30d';
export type ProfileSort = 'updated-desc' | 'name-asc' | 'birth-asc' | 'recent-desc';

export interface DirectoryQuery {
  search: string;
  recent: RecentFilter;
  sort: ProfileSort;
}

export type ProfileRecents = Record<string, number>;

const DAY_MS = 24 * 60 * 60 * 1000;
const ZONED_ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalized(value: unknown): string {
  return unicodeDefaultCaseFold(text(value).normalize('NFKC')).replace(/\s+/g, ' ');
}

function compareLexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareIds(left: Profile, right: Profile): number {
  const leftId = text(left.id);
  const rightId = text(right.id);
  return compareLexical(leftId, rightId);
}

function validRecentUse(value: unknown, now: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value <= now ? value : undefined;
}

function hasValidCalendarDate(year: number, month: number, day: number): boolean {
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function validUpdatedAt(value: unknown, now: number): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = ZONED_ISO_TIMESTAMP.exec(value);
  if (!match) return undefined;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const [year, month, day, hour, minute, second] = [
    yearText, monthText, dayText, hourText, minuteText, secondText,
  ].map(Number);
  if (
    !hasValidCalendarDate(year, month, day)
    || hour > 23
    || minute > 59
    || second > 59
    || (offsetHourText !== undefined && Number(offsetHourText) > 23)
    || (offsetMinuteText !== undefined && Number(offsetMinuteText) > 59)
  ) return undefined;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now ? timestamp : undefined;
}

function birthParts(profile: Profile): readonly number[] | undefined {
  const birthData = profile.birthData;
  if (!birthData) return undefined;
  const parts = [birthData.year, birthData.month, birthData.day, birthData.hour, birthData.minute];
  if (
    !parts.every(Number.isInteger)
    || birthData.year < 1
    || birthData.year > 3000
    || !hasValidCalendarDate(birthData.year, birthData.month, birthData.day)
    || birthData.hour < 0
    || birthData.hour > 23
    || birthData.minute < 0
    || birthData.minute > 59
  ) return undefined;
  return parts;
}

function compareOptionalDescending(left: number | undefined, right: number | undefined): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return right - left;
}

function searchableText(profile: Profile): string {
  const tags = Array.isArray(profile.tags) ? profile.tags : [];
  return normalized([
    profile.nameZh,
    profile.nameEn,
    profile.birthData?.location?.label,
    ...tags,
    profile.notes,
  ].map(text).join(' '));
}

export function profileDisplayName(profile: Profile): string {
  return text(profile.nameZh) || text(profile.nameEn);
}

export function selectDirectoryProfiles(
  profiles: readonly Profile[],
  query: DirectoryQuery,
  recents: ProfileRecents,
  now = Date.now(),
): Profile[] {
  const tokens = normalized(query.search).split(' ').filter(Boolean);
  const recentWindow = query.recent === '7d' ? 7 * DAY_MS : 30 * DAY_MS;

  const selected = profiles.filter((profile) => {
    const haystack = searchableText(profile);
    if (!tokens.every((token) => haystack.includes(token))) return false;
    if (query.recent === 'all') return true;

    const recentUse = validRecentUse(recents[profile.id], now);
    return recentUse !== undefined && recentUse >= now - recentWindow;
  });

  return selected.sort((left, right) => {
    let order = 0;

    switch (query.sort) {
      case 'name-asc':
        // Deterministic Unicode lexical order; this intentionally does not implement pinyin collation.
        order = compareLexical(
          normalized(profileDisplayName(left)),
          normalized(profileDisplayName(right)),
        );
        break;
      case 'birth-asc': {
        const leftBirth = birthParts(left);
        const rightBirth = birthParts(right);
        if (!leftBirth) order = rightBirth ? 1 : 0;
        else if (!rightBirth) order = -1;
        else {
          for (let index = 0; index < leftBirth.length && order === 0; index += 1) {
            order = leftBirth[index] - rightBirth[index];
          }
        }
        break;
      }
      case 'recent-desc':
        order = compareOptionalDescending(
          validRecentUse(recents[left.id], now),
          validRecentUse(recents[right.id], now),
        );
        break;
      case 'updated-desc':
        order = compareOptionalDescending(
          validUpdatedAt(left.updatedAt, now),
          validUpdatedAt(right.updatedAt, now),
        );
        break;
    }

    return order || compareIds(left, right);
  });
}

import type { Profile } from '../../api/contracts';

export type RecentFilter = 'all' | '7d' | '30d';
export type ProfileSort = 'updated-desc' | 'name-asc' | 'birth-asc' | 'recent-desc';

export interface DirectoryQuery {
  search: string;
  recent: RecentFilter;
  sort: ProfileSort;
}

export type ProfileRecents = Record<string, number>;

const DAY_MS = 24 * 60 * 60 * 1000;
const NAME_COLLATOR = new Intl.Collator('zh-Hans-CN', {
  usage: 'sort',
  sensitivity: 'base',
  numeric: false,
  caseFirst: 'false',
});
const ZONED_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalized(value: unknown): string {
  return text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
}

function compareIds(left: Profile, right: Profile): number {
  const leftId = text(left.id);
  const rightId = text(right.id);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function validRecentUse(value: unknown, now: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value <= now ? value : undefined;
}

function hasValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function validUpdatedAt(value: unknown, now: number): number | undefined {
  if (
    typeof value !== 'string'
    || (!ZONED_ISO_TIMESTAMP.test(value) && !ISO_DATE.test(value))
    || !hasValidCalendarDate(value)
  ) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now ? timestamp : undefined;
}

function birthParts(profile: Profile): readonly number[] | undefined {
  const birthData = profile.birthData;
  const parts = birthData
    ? [birthData.year, birthData.month, birthData.day, birthData.hour, birthData.minute]
    : [];
  return parts.length === 5 && parts.every(Number.isFinite) ? parts : undefined;
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
        order = NAME_COLLATOR.compare(profileDisplayName(left), profileDisplayName(right));
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

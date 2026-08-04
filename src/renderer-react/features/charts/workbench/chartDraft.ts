import type { CitySearchResult, Profile } from '../../../api/contracts';
import { CHART_DESCRIPTORS } from '../catalog';
import type {
  ChartReferenceData,
  ChartOptionName,
  ChartRequest,
  ChartRoute,
  ChartType,
  DynamicControl,
  Zodiac,
} from '../contracts';

export const DEFAULT_ASPECTS = [
  'conjunction', 'opposition', 'trine', 'square', 'sextile',
  'quincunx', 'sesquiquadrate', 'semisquare', 'semisextile', 'quintile',
] as const;

export interface ChartDraft {
  route: ChartRoute;
  type: ChartType;
  primaryProfileId: string | null;
  secondaryProfileId: string | null;
  targetLocal: string;
  returnYear: number;
  relocationPlace: CitySearchResult | null;
  houseSystem: string;
  zodiac: Zodiac;
  enabledAspects: string[];
  orbOverrides: Record<string, number>;
}

export interface SubmittedChartSnapshot {
  route: ChartRoute;
  type: ChartType;
  primaryProfileId: string;
  secondaryProfileId: string | null;
  request: ChartRequest;
}

export type ChartDraftErrorCode =
  | 'errorRouteType'
  | 'errorPrimaryProfile'
  | 'errorSecondaryProfile'
  | 'errorRelationshipProfiles'
  | 'errorHouseSystem'
  | 'errorZodiac'
  | 'errorAspects'
  | 'errorTargetDate'
  | 'errorReturnYear'
  | 'errorRelocation';

export interface DraftValidation {
  valid: boolean;
  fieldErrors: Partial<Record<keyof ChartDraft | 'advancedAspects', ChartDraftErrorCode>>;
}

export interface DraftEnvironment {
  now: Date;
  profiles: readonly Profile[];
  reference: ChartReferenceData;
  persistedPrimaryId: string | null;
  recentSecondaryIds: readonly string[];
  toInstant(local: string): string;
}

function localMinute(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function birthPlace(profile: Profile | undefined): CitySearchResult | null {
  if (!profile) return null;
  const { label, latitude, longitude } = profile.birthData.location;
  return {
    key: `${latitude.toFixed(6)}:${longitude.toFixed(6)}`,
    label,
    nameZh: label,
    nameEn: '',
    region: '',
    country: '',
    latitude,
    longitude,
    source: 'western',
  };
}

export function controlsFor(type: ChartType): readonly DynamicControl[] {
  return CHART_DESCRIPTORS[type].controls;
}

function hasOption(type: ChartType, option: ChartOptionName): boolean {
  return (CHART_DESCRIPTORS[type].serviceOptions as readonly ChartOptionName[]).includes(option);
}

export function createDefaultDraft(route: ChartRoute, environment: DraftEnvironment): ChartDraft {
  const profileIds = new Set(environment.profiles.map(({ id }) => id));
  const primaryProfileId = environment.persistedPrimaryId && profileIds.has(environment.persistedPrimaryId)
    ? environment.persistedPrimaryId
    : environment.profiles[0]?.id ?? null;
  const secondaryProfileId = environment.recentSecondaryIds.find(
    (id) => id !== primaryProfileId && profileIds.has(id),
  ) ?? environment.profiles.find(({ id }) => id !== primaryProfileId)?.id ?? null;
  const primary = environment.profiles.find(({ id }) => id === primaryProfileId);
  const referenceAspects = new Set(Object.keys(environment.reference.aspects));
  const enabledAspects = DEFAULT_ASPECTS.filter((aspect) => referenceAspects.has(aspect));
  const placidus = environment.reference.houseSystems.find(
    ({ value }) => value.trim().toLowerCase() === 'placidus',
  );

  return {
    route,
    type: route === 'personal' ? 'natal' : 'synastry',
    primaryProfileId,
    secondaryProfileId: route === 'relationship' ? secondaryProfileId : null,
    targetLocal: localMinute(environment.now),
    returnYear: environment.now.getFullYear(),
    relocationPlace: birthPlace(primary),
    houseSystem: placidus?.value ?? environment.reference.houseSystems[0]?.value ?? 'placidus',
    zodiac: 'tropical',
    enabledAspects,
    orbOverrides: {},
  };
}

function validLocalMinute(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (year < 1 || year > 3000 || month < 1 || month > 12 || hour > 23 || minute > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

export function validateChartDraft(draft: ChartDraft, environment: DraftEnvironment): DraftValidation {
  const fieldErrors: DraftValidation['fieldErrors'] = {};
  const descriptor = CHART_DESCRIPTORS[draft.type];
  const primary = environment.profiles.find(({ id }) => id === draft.primaryProfileId);
  const secondary = environment.profiles.find(({ id }) => id === draft.secondaryProfileId);

  if (descriptor.route !== draft.route) fieldErrors.type = 'errorRouteType';
  if (!primary) fieldErrors.primaryProfileId = 'errorPrimaryProfile';
  if (descriptor.requiresSecondary && (!secondary || secondary.id === primary?.id)) {
    fieldErrors.secondaryProfileId = environment.profiles.length < 2
      ? 'errorRelationshipProfiles'
      : 'errorSecondaryProfile';
  }
  if (!environment.reference.houseSystems.some(({ value }) => value === draft.houseSystem)) {
    fieldErrors.houseSystem = 'errorHouseSystem';
  }
  if (draft.zodiac !== 'tropical' && draft.zodiac !== 'sidereal') fieldErrors.zodiac = 'errorZodiac';

  const knownAspects = new Set(Object.keys(environment.reference.aspects));
  if (draft.enabledAspects.some((key) => !knownAspects.has(key))
    || Object.entries(draft.orbOverrides).some(([key, orb]) =>
      !knownAspects.has(key) || !Number.isFinite(orb) || orb < 0.1 || orb > 15)) {
    fieldErrors.advancedAspects = 'errorAspects';
  }
  if (hasOption(draft.type, 'targetDate') && !validLocalMinute(draft.targetLocal)) {
    fieldErrors.targetLocal = 'errorTargetDate';
  }
  if (hasOption(draft.type, 'year')
    && (!Number.isInteger(draft.returnYear) || draft.returnYear < 1 || draft.returnYear > 3000)) {
    fieldErrors.returnYear = 'errorReturnYear';
  }
  if (hasOption(draft.type, 'location')) {
    const place = draft.relocationPlace;
    if (!place || !place.label.trim() || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)
      || place.latitude < -90 || place.latitude > 90 || place.longitude < -180 || place.longitude > 180) {
      fieldErrors.relocationPlace = 'errorRelocation';
    }
  }
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function buildSubmittedSnapshot(
  draft: ChartDraft,
  environment: DraftEnvironment,
): SubmittedChartSnapshot {
  const validation = validateChartDraft(draft, environment);
  if (!validation.valid) throw new Error(Object.values(validation.fieldErrors)[0] ?? 'invalidChartDraft');
  const descriptor = CHART_DESCRIPTORS[draft.type];
  const primary = environment.profiles.find(({ id }) => id === draft.primaryProfileId)!;
  const secondary = environment.profiles.find(({ id }) => id === draft.secondaryProfileId);
  const options: ChartRequest['options'] = {};
  if (hasOption(draft.type, 'targetDate')) options.targetDate = environment.toInstant(draft.targetLocal);
  if (hasOption(draft.type, 'year')) options.year = draft.returnYear;
  if (hasOption(draft.type, 'location')) {
    options.latitude = draft.relocationPlace!.latitude;
    options.longitude = draft.relocationPlace!.longitude;
    options.locationLabel = draft.relocationPlace!.label;
  }
  const snapshot: SubmittedChartSnapshot = {
    route: draft.route,
    type: draft.type,
    primaryProfileId: primary.id,
    secondaryProfileId: descriptor.requiresSecondary ? secondary!.id : null,
    request: {
      type: draft.type,
      primary,
      ...(descriptor.requiresSecondary ? { secondary } : {}),
      settings: {
        houseSystem: draft.houseSystem,
        zodiac: draft.zodiac,
        aspects: { enabled: [...draft.enabledAspects], orbOverrides: { ...draft.orbOverrides } },
      },
      options,
    },
  };
  return deepFreeze(structuredClone(snapshot));
}

export function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => structurallyEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return structurallyEqual(leftKeys, rightKeys)
    && leftKeys.every((key) => structurallyEqual(leftRecord[key], rightRecord[key]));
}

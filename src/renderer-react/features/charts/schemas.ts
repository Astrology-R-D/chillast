import { z } from 'zod';
import { CHART_DESCRIPTORS } from './catalog';
import { CHART_TYPES } from './contracts';
import type {
  ChartReferenceData,
  ChartRequest,
} from './contracts';

const finite = z.number().finite();
const longitude = finite.min(0).lt(360);
const isoInstant = z.string().datetime({ offset: true });
const dmsSchema = z.object({
  degrees: z.number().int().min(0),
  minutes: z.number().int().min(0).max(60),
  seconds: z.number().int().min(0).max(60),
}).strict();

export const chartTypeSchema = z.enum(CHART_TYPES);

export const chartCatalogDefinitionSchema = z.object({
  type: chartTypeSchema,
  nameZh: z.string(),
  nameEn: z.string(),
  category: z.enum(['personal', 'relationship']),
  requiresSecondary: z.boolean(),
  options: z.array(z.enum(['targetDate', 'year', 'location'])),
}).strict();

export const chartOptionsSchema = z.object({
  targetDate: isoInstant.optional(),
  year: z.number().int().min(1).max(3000).optional(),
  latitude: finite.min(-90).max(90).optional(),
  longitude: finite.min(-180).max(180).optional(),
  locationLabel: z.string().min(1).optional(),
}).strict();

export const chartSettingsSchema = z.object({
  houseSystem: z.string().min(1),
  zodiac: z.enum(['tropical', 'sidereal']),
  aspects: z.object({
    enabled: z.array(z.string()).max(10),
    orbOverrides: z.record(z.string(), finite.min(0.1).max(15)),
  }).strict(),
}).strict();

const locationSchema = z.object({
  label: z.string().min(1),
  latitude: finite.min(-90).max(90),
  longitude: finite.min(-180).max(180),
}).strict();

const profileSchema = z.object({
  id: z.string().min(1),
  nameZh: z.string(),
  nameEn: z.string(),
  gender: z.enum(['male', 'female', 'other']),
  birthData: z.object({
    year: z.number().int().min(1).max(3000),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    location: locationSchema,
  }).strict(),
  notes: z.string(),
  tags: z.array(z.string()),
  createdAt: isoInstant,
  updatedAt: isoInstant,
}).strict();

const optionKeysByServiceOption = {
  targetDate: ['targetDate'],
  year: ['year'],
  location: ['latitude', 'longitude', 'locationLabel'],
} as const;

export const chartRequestSchema = z.object({
  type: chartTypeSchema,
  primary: profileSchema,
  secondary: profileSchema.optional(),
  settings: chartSettingsSchema,
  options: chartOptionsSchema,
}).strict().superRefine((request, context) => {
  const descriptor = CHART_DESCRIPTORS[request.type];
  if (descriptor.requiresSecondary) {
    if (!request.secondary) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Relationship chart requires a secondary profile', path: ['secondary'] });
    } else if (request.secondary.id === request.primary.id) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Relationship profiles must be distinct', path: ['secondary', 'id'] });
    }
  } else if (request.secondary) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Personal chart does not accept a secondary profile', path: ['secondary'] });
  }

  const allowed = new Set<string>(descriptor.serviceOptions.flatMap((option) => optionKeysByServiceOption[option]));
  for (const key of Object.keys(request.options)) {
    if (!allowed.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Undeclared option: ${key}`, path: ['options', key] });
  }
  if (descriptor.serviceOptions.some((option) => option === 'targetDate') && !request.options.targetDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'targetDate is required', path: ['options', 'targetDate'] });
  }
  if (descriptor.serviceOptions.some((option) => option === 'year') && request.options.year === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'year is required', path: ['options', 'year'] });
  }
  if (descriptor.serviceOptions.some((option) => option === 'location')) {
    if (request.options.latitude === undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: 'latitude is required', path: ['options', 'latitude'] });
    if (request.options.longitude === undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: 'longitude is required', path: ['options', 'longitude'] });
  }
});

const signReferenceSchema = z.object({
  key: z.string(), nameEn: z.string(), nameZh: z.string(), shortZh: z.string(), glyph: z.string(),
  element: z.string(), modality: z.string(), ruler: z.string(),
}).strict();
const pointReferenceSchema = z.object({
  nameEn: z.string(), nameZh: z.string(), glyph: z.string(), kind: z.enum(['body', 'point', 'angle']),
}).strict();
const aspectReferenceSchema = z.object({
  nameEn: z.string(), nameZh: z.string(), angle: finite, defaultOrb: finite.min(0.1).max(15),
  level: z.enum(['major', 'minor']), glyph: z.string(),
}).strict();
const elementReferenceSchema = z.object({ nameEn: z.string(), nameZh: z.string(), token: z.string() }).strict();
const modalityReferenceSchema = z.object({ nameEn: z.string(), nameZh: z.string() }).strict();
const houseSystemSchema = z.object({ value: z.string().min(1), nameEn: z.string(), nameZh: z.string() }).strict();

export const chartReferenceDataSchema = z.object({
  signs: z.array(signReferenceSchema),
  points: z.record(z.string(), pointReferenceSchema),
  aspects: z.record(z.string(), aspectReferenceSchema),
  elements: z.record(z.string(), elementReferenceSchema),
  modalities: z.record(z.string(), modalityReferenceSchema),
  houseSystems: z.array(houseSystemSchema),
  chartTypes: z.array(chartCatalogDefinitionSchema),
}).strict();

const rawPointSchema = z.object({
  key: z.string().min(1), kind: z.enum(['body', 'point']), glyph: z.string(), nameEn: z.string(), nameZh: z.string(),
  longitude, signKey: z.string(), signGlyph: z.string(), signNameZh: z.string(), signIndex: z.number().int().min(0).max(11),
  degreeInSign: finite.min(0).lt(30), dms: dmsSchema, retrograde: z.boolean(), house: z.number().int().min(1).max(12).nullable(),
}).strict();
const rawRingSchema = z.object({ id: z.string().min(1), role: z.string(), label: z.string(), points: z.array(rawPointSchema) }).strict();
const rawHouseSchema = z.object({
  index: z.number().int().min(1).max(12), cuspLongitude: longitude, signKey: z.string(), signGlyph: z.string(),
  signNameZh: z.string(), degreeInSign: finite.min(0).lt(30),
}).strict();
const chartAngleSchema = z.object({
  key: z.string(), glyph: z.string(), nameZh: z.string(), longitude, signKey: z.string(), signGlyph: z.string(),
  signIndex: z.number().int().min(0).max(11), degreeInSign: finite.min(0).lt(30), dms: dmsSchema,
}).strict();
const chartSubjectSchema = z.object({
  role: z.string(), nameZh: z.string(), nameEn: z.string(), gender: z.string(), birthLabel: z.string(), location: locationSchema,
}).strict();
const rawAspectSchema = z.object({
  point1: z.string().min(1), point2: z.string().min(1), aspectKey: z.string().min(1), glyph: z.string(), nameZh: z.string(),
  nameEn: z.string(), level: z.enum(['major', 'minor']), exactAngle: finite, orb: finite, orbUsed: finite,
  strength: finite, separation: finite,
}).strict();
const chartMetaSchema = z.object({
  type: chartTypeSchema,
  typeNameZh: z.string(),
  title: z.string(),
  subtitle: z.string(),
  settings: z.object({ houseSystem: z.string().min(1), zodiac: z.enum(['tropical', 'sidereal']) }).strict(),
  generatedAt: isoInstant,
  instantUtc: isoInstant.nullable(),
}).catchall(z.unknown());

export const rawChartResultSchema = z.object({
  meta: chartMetaSchema,
  subjects: z.array(chartSubjectSchema),
  houses: z.array(rawHouseSchema),
  angles: z.record(z.string(), chartAngleSchema),
  rings: z.array(rawRingSchema),
  aspects: z.array(rawAspectSchema),
  distributions: z.object({ elements: z.record(z.string(), finite), modalities: z.record(z.string(), finite) }).strict(),
}).strict();

export type RawChartResult = z.infer<typeof rawChartResultSchema>;

function parseWithMessage<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(message, { cause: parsed.error });
  return parsed.data;
}

export function parseChartReferenceData(value: unknown): ChartReferenceData {
  return parseWithMessage(chartReferenceDataSchema, value, 'Chart reference validation failed') as ChartReferenceData;
}

export function parseChartRequest(value: unknown, reference: ChartReferenceData): ChartRequest {
  const request = parseWithMessage(chartRequestSchema, value, 'Chart request validation failed') as ChartRequest;
  const houseSystems = new Set(reference.houseSystems.map(({ value: token }) => token));
  const aspectKeys = new Set(Object.keys(reference.aspects));
  if (!houseSystems.has(request.settings.houseSystem)
    || request.settings.aspects.enabled.some((key) => !aspectKeys.has(key))
    || Object.keys(request.settings.aspects.orbOverrides).some((key) => !aspectKeys.has(key))) {
    throw new Error('Chart request validation failed');
  }
  return request;
}

export function parseRawChartResult(value: unknown): RawChartResult {
  return parseWithMessage(rawChartResultSchema, value, 'Chart response validation failed');
}

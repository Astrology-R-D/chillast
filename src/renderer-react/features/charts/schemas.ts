import { z } from 'zod';
import { CHART_DESCRIPTORS } from './catalog';
import { CHART_TYPES, ELEMENT_KEYS, MODALITY_KEYS } from './contracts';
import type {
  ChartReferenceData,
  ChartRequest,
} from './contracts';

const finite = z.number().finite();
const longitude = finite.min(0).lt(360);
const isoInstant = z.string().datetime({ offset: true });
const invalidPlainObject = Symbol('invalidPlainObject');

function plainOwnSchema<Schema extends z.ZodTypeAny>(keys: readonly string[], schema: Schema) {
  return z.preprocess((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidPlainObject;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return invalidPlainObject;
    if (keys.some((key) => key in value && !Object.prototype.hasOwnProperty.call(value, key))) {
      return invalidPlainObject;
    }
    return value;
  }, schema);
}

function strictObject<Shape extends z.ZodRawShape>(shape: Shape) {
  return plainOwnSchema(Object.keys(shape), z.object(shape).strict());
}

function extensibleObject<Shape extends z.ZodRawShape>(shape: Shape) {
  return plainOwnSchema(Object.keys(shape), z.object(shape).catchall(z.unknown()));
}

function plainRecord<Value extends z.ZodTypeAny>(value: Value) {
  return plainOwnSchema([], z.record(z.string(), value));
}

const stableToken = z.string().regex(/^[A-Za-z0-9_-]+$/);
const elementKeySchema = z.enum(ELEMENT_KEYS);
const modalityKeySchema = z.enum(MODALITY_KEYS);
const dmsSchema = strictObject({
  degrees: z.number().int().min(0),
  minutes: z.number().int().min(0).max(60),
  seconds: z.number().int().min(0).max(60),
});

export const chartTypeSchema = z.enum(CHART_TYPES);

export const chartCatalogDefinitionSchema = strictObject({
  type: chartTypeSchema,
  nameZh: z.string(),
  nameEn: z.string(),
  category: z.enum(['personal', 'relationship']),
  requiresSecondary: z.boolean(),
  options: z.array(z.enum(['targetDate', 'year', 'location'])),
});

export const chartOptionsSchema = strictObject({
  targetDate: isoInstant.optional(),
  year: z.number().int().min(1).max(3000).optional(),
  latitude: finite.min(-90).max(90).optional(),
  longitude: finite.min(-180).max(180).optional(),
  locationLabel: z.string().trim().min(1).optional(),
});

export const chartSettingsSchema = strictObject({
  houseSystem: z.string().min(1),
  zodiac: z.enum(['tropical', 'sidereal']),
  aspects: strictObject({
    enabled: z.array(z.string()).max(10),
    orbOverrides: plainRecord(finite.min(0.1).max(15)),
  }),
});

const locationSchema = strictObject({
  label: z.string().min(1),
  latitude: finite.min(-90).max(90),
  longitude: finite.min(-180).max(180),
});

const profileSchema = strictObject({
  id: z.string().min(1),
  nameZh: z.string(),
  nameEn: z.string(),
  gender: z.enum(['male', 'female', 'other']),
  birthData: strictObject({
    year: z.number().int().min(1).max(3000),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    location: locationSchema,
  }),
  notes: z.string(),
  tags: z.array(z.string()),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

const optionKeysByServiceOption = {
  targetDate: ['targetDate'],
  year: ['year'],
  location: ['latitude', 'longitude', 'locationLabel'],
} as const;

export const chartRequestSchema = strictObject({
  type: chartTypeSchema,
  primary: profileSchema,
  secondary: profileSchema.optional(),
  settings: chartSettingsSchema,
  options: chartOptionsSchema,
}).superRefine((request, context) => {
  const descriptor = CHART_DESCRIPTORS[request.type];
  if (descriptor.requiresSecondary) {
    if (!request.secondary) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Relationship chart requires a secondary profile', path: ['secondary'] });
    } else if (request.secondary.id === request.primary.id) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Relationship profiles must be distinct', path: ['secondary', 'id'] });
    }
  } else if (Object.prototype.hasOwnProperty.call(request, 'secondary')) {
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
    if (!request.options.locationLabel) context.addIssue({ code: z.ZodIssueCode.custom, message: 'locationLabel is required', path: ['options', 'locationLabel'] });
  }
});

const signReferenceSchema = strictObject({
  key: z.string(), nameEn: z.string(), nameZh: z.string(), shortZh: z.string(), glyph: z.string(),
  element: elementKeySchema, modality: modalityKeySchema, ruler: z.string(),
});
const pointReferenceSchema = strictObject({
  nameEn: z.string(), nameZh: z.string(), glyph: z.string(), kind: z.enum(['body', 'point', 'angle']),
});
const aspectReferenceSchema = strictObject({
  nameEn: z.string(), nameZh: z.string(), angle: finite, defaultOrb: finite.min(0.1).max(15),
  level: z.enum(['major', 'minor']), glyph: z.string(),
});
const elementReferenceSchema = strictObject({ nameEn: z.string(), nameZh: z.string(), token: z.string() });
const modalityReferenceSchema = strictObject({ nameEn: z.string(), nameZh: z.string() });
const houseSystemSchema = strictObject({ value: z.string().min(1), nameEn: z.string(), nameZh: z.string() });

export const chartReferenceDataSchema = strictObject({
  signs: z.array(signReferenceSchema),
  points: plainRecord(pointReferenceSchema),
  aspects: plainRecord(aspectReferenceSchema),
  elements: strictObject({ fire: elementReferenceSchema, earth: elementReferenceSchema, air: elementReferenceSchema, water: elementReferenceSchema }),
  modalities: strictObject({ cardinal: modalityReferenceSchema, fixed: modalityReferenceSchema, mutable: modalityReferenceSchema }),
  houseSystems: z.array(houseSystemSchema),
  chartTypes: z.array(chartCatalogDefinitionSchema),
});

const rawPointSchema = strictObject({
  key: stableToken, kind: z.enum(['body', 'point']), glyph: z.string(), nameEn: z.string(), nameZh: z.string(),
  longitude, signKey: z.string(), signGlyph: z.string(), signNameZh: z.string(), signIndex: z.number().int().min(0).max(11),
  degreeInSign: finite.min(0).lt(30), dms: dmsSchema, retrograde: z.boolean(), house: z.number().int().min(1).max(12).nullable(),
});
const rawRingSchema = strictObject({ id: stableToken, role: z.string(), label: z.string(), points: z.array(rawPointSchema) });
const rawHouseSchema = strictObject({
  index: z.number().int().min(1).max(12), cuspLongitude: longitude, signKey: z.string(), signGlyph: z.string(),
  signNameZh: z.string(), degreeInSign: finite.min(0).lt(30),
});
const chartAngleSchema = strictObject({
  key: z.string(), glyph: z.string(), nameZh: z.string(), longitude, signKey: z.string(), signGlyph: z.string(),
  signIndex: z.number().int().min(0).max(11), degreeInSign: finite.min(0).lt(30), dms: dmsSchema,
});
const chartSubjectSchema = strictObject({
  role: z.string(), nameZh: z.string(), nameEn: z.string(), gender: z.string(), birthLabel: z.string(), location: locationSchema,
});
const rawAspectSchema = strictObject({
  point1: stableToken, point2: stableToken, aspectKey: stableToken, glyph: z.string(), nameZh: z.string(),
  nameEn: z.string(), level: z.enum(['major', 'minor']), exactAngle: finite, orb: finite, orbUsed: finite,
  strength: finite, separation: finite,
});
const chartMetaSchema = extensibleObject({
  type: chartTypeSchema,
  typeNameZh: z.string(),
  title: z.string(),
  subtitle: z.string(),
  settings: strictObject({ houseSystem: z.string().min(1), zodiac: z.enum(['tropical', 'sidereal']) }),
  generatedAt: isoInstant,
  instantUtc: isoInstant.nullable(),
});

export const rawChartResultSchema = strictObject({
  meta: chartMetaSchema,
  subjects: z.array(chartSubjectSchema),
  houses: z.array(rawHouseSchema),
  angles: plainRecord(chartAngleSchema),
  rings: z.array(rawRingSchema),
  aspects: z.array(rawAspectSchema),
  distributions: strictObject({
    elements: strictObject({ fire: finite, earth: finite, air: finite, water: finite }),
    modalities: strictObject({ cardinal: finite, fixed: finite, mutable: finite }),
  }),
});

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
  return parseWithMessage(rawChartResultSchema, value, 'Chart response validation failed') as RawChartResult;
}

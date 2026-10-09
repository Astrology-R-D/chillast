import { z } from 'zod';

const element = z.enum(['wood', 'fire', 'earth', 'metal', 'water', 'unknown']);
const stem = z.object({ char: z.string(), element, yinYang: z.string() });
const branch = stem.extend({ animal: z.string() });
const pillar = z.object({ full: z.string(), stem, branch });
const count = z.number().finite().nonnegative();
export const baziResultSchema = z.object({
  bazi: z.object({
    pillars: z.object({ year: pillar, month: pillar, day: pillar, hour: pillar }),
    dayMaster: stem, localTrueSolarTime: z.string(),
    allHourPillars: z.array(pillar.extend({ shichen: z.string(), hours: z.string(), isCurrent: z.boolean() })).max(12),
  }),
  analysis: z.object({
    dayMaster: stem,
    pillars: z.array(z.object({ key: z.enum(['year', 'month', 'day', 'hour']), stemChar: z.string(), stemElement: element, stemTenGod: z.string(), branchChar: z.string(), branchElement: element, branchAnimal: z.string(), hidden: z.array(z.object({ char: z.string(), element, tenGod: z.string() })) })),
    elementCounts: z.object({ wood: count, fire: count, earth: count, metal: count, water: count }),
    strength: z.object({ supportive: count, total: count, ratio: count, label: z.string(), supportElement: z.string(), resourceElement: z.string().optional() }),
  }).nullable(),
  lunar: z.object({
    lunarYear: z.string(), lunarMonth: z.string(), lunarDay: z.string(), isLeapMonth: z.boolean(), zodiacAnimal: z.string(),
    solarTerm: z.string().nullable(), constellation: z.string(), huangdiYear: z.number(), eraName: z.string(), monthSize: z.number(),
    festivals: z.object({ major: z.string(), important: z.string(), minor: z.string(), isHoliday: z.boolean() }),
    moonPhase: z.object({ name: z.string(), time: z.string() }),
  }),
});
export type BaziResult = z.infer<typeof baziResultSchema>;
export const solarTermCalendarSchema = z.object({
  year: z.number().int().min(1).max(3000), lunarYear: z.string(), zodiac: z.string(),
  terms: z.array(z.object({ name: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string(), lunarDate: z.string() })).length(24),
});
export type SolarTermCalendar = z.infer<typeof solarTermCalendarSchema>;

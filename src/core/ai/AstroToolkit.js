'use strict';

const esm = require('./esm-bridge');
const { chartToolResult, baziToolResult, decorateTools } = require('./ToolResult');
const { birthIdentity } = require('./AnalysisTask');

function targetInstant(input) {
  if (input.targetDate) {
    const match = input.targetDate.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/);
    if (!match || !Number.isFinite(Date.parse(input.targetDate)) || new Date(`${match[1]}T12:00Z`).toISOString().slice(0, 10) !== match[1]) throw new Error('targetDate 必须是有效且带时区的 ISO 时间');
    return new Date(input.targetDate).toISOString();
  }
  if (![input.targetYear, input.targetMonth, input.targetDay].every(Number.isInteger)) throw new Error('需要目标年月日或带时区的 targetDate');
  const date = new Date(Date.UTC(input.targetYear, input.targetMonth - 1, input.targetDay, 12));
  if (date.getUTCFullYear() !== input.targetYear || date.getUTCMonth() + 1 !== input.targetMonth || date.getUTCDate() !== input.targetDay) throw new Error('目标日期无效');
  return date.toISOString();
}

/**
 * Build a Profile-compatible plain object from flat birth-data input.
 * The shape matches what AstrologyService._normalizeSubject (via Profile.fromJSON)
 * expects: nameZh, gender, and a birthData block with a nested location.
 */
function _makeProfile(name, input) {
  return {
    nameZh: name,
    gender: 'other',
    birthData: {
      year: input.year,
      month: input.month,
      day: input.day,
      hour: input.hour,
      minute: input.minute,
      location: {
        label: `${input.latitude},${input.longitude}`,
        latitude: input.latitude,
        longitude: input.longitude,
      },
    },
  };
}

/**
 * Serialize a ChartData DTO into a compact text representation suitable for
 * inclusion in an LLM prompt. Delegates to ChartSerializer when available;
 * falls back to truncated JSON otherwise.
 */
function _serializeChart(chart) {
  try {
    const { toText } = require('./prompts/ChartSerializer');
    return toText(chart);
  } catch (_) {
    return JSON.stringify(chart, null, 2).slice(0, 4000);
  }
}

function _serializeCurrentChartContext(ctx) {
  const chart = _serializeChart(ctx.lastChartData);
  if (ctx.kind !== 'western-chart') return chart;
  const workspace = {
    route: ctx.route,
    activeProfile: ctx.activeProfile,
    successfulFilters: ctx.successfulFilters,
    focusedIdentity: ctx.focusedIdentity,
    draftIsStale: ctx.draftIsStale,
    draftSummary: ctx.draftSummary,
    ...(ctx.selectedRows ? { selectedRows: ctx.selectedRows } : {}),
  };
  return `${chart}\n\n【当前工作区上下文】\n${JSON.stringify(workspace)}`;
}

/**
 * Build the astrology/命理 computation tools with a snapshot of chart settings.
 * Each tool takes flat numeric/string inputs and returns a string result,
 * suitable for a ReAct agent.
 *
 * @param {import('../astrology/AstrologyService')} astrologyService
 * @param {import('../chinese/ChineseAstrologyService')} chineseAstrologyService
 * @param {object} [defaultSettings] Accepted workspace settings, never the uncalculated draft.
 * @returns {Promise<import('@langchain/core/tools').DynamicStructuredTool[]>}
 */
async function buildComputeTools(astrologyService, chineseAstrologyService, defaultSettings = {}) {
  const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
  const z = require('zod');
  const { HOUSE_SYSTEMS } = require('../astrology/Constants');
  const inheritedSettings = structuredClone(defaultSettings);
  const chartSettingsSchema = {
    settings: z.object({
      houseSystem: z.enum(HOUSE_SYSTEMS.map((s) => s.value)).optional().describe('宫位制'),
      zodiac: z.enum(['tropical', 'sidereal']).optional().describe('回归黄道或恒星黄道（Lahiri）'),
    }).optional().describe('未指定时沿用当前已计算星盘的宫位制和黄道；没有当前星盘时为普拉西度、回归黄道。'),
  };
  const settingsFor = (input) => ({ houseSystem: 'placidus', zodiac: 'tropical', ...inheritedSettings, ...input.settings });
  const timedSchema = {
    targetYear: z.number().int().nullable().optional().describe('目标年份；使用 targetDate 时可省略'),
    targetMonth: z.number().int().min(1).max(12).nullable().optional().describe('目标月份'),
    targetDay: z.number().int().min(1).max(31).nullable().optional().describe('目标日期'),
    targetDate: z.string().nullable().optional().describe('精确目标时刻，必须为带时区的 ISO 时间；此刻/实时问题使用本轮时间。优先于年月日。'),
  };
  const calculationFor = (input, profiles, targetDate = null) => ({ subjectKeys: profiles.map(p => birthIdentity(p.birthData)), settings: settingsFor(input), targetDate,
    targetDay: targetDate ? (input.targetDate || targetDate).slice(0, 10) : null });

  const birthSchema = {
    year: z.number().int().describe('出生年份，如 1990'),
    month: z.number().int().min(1).max(12).describe('出生月份 1-12'),
    day: z.number().int().min(1).max(31).describe('出生日期 1-31'),
    hour: z.number().int().min(0).max(23).describe('出生小时 0-23'),
    minute: z.number().int().min(0).max(59).describe('出生分钟 0-59'),
    latitude: z.number().min(-90).max(90).describe('出生地纬度'),
    longitude: z.number().min(-180).max(180).describe('出生地经度'),
  };

  const computeNatalChart = new DynamicStructuredTool({
    name: 'compute_natal_chart',
    description:
      '计算某人的本命星盘。输入出生年月日时分和出生地经纬度，返回完整的行星位置、宫位、相位数据。',
    schema: z.object({ ...birthSchema, ...chartSettingsSchema }),
    func: async (input) => {
      try {
        const profile = _makeProfile('查询对象', input);
        const chart = astrologyService.computeChart({ type: 'natal', primary: profile, settings: settingsFor(input) });
        return chartToolResult(chart, _serializeChart(chart), calculationFor(input, [profile]));
      } catch (e) {
        return `计算失败: ${e.message}`;
      }
    },
  });

  const computeTransit = new DynamicStructuredTool({
    name: 'compute_transit',
    description:
      '计算某人在指定日期的行运盘，分析天象对本命盘的影响。需要出生数据和目标日期。',
    schema: z.object({
      ...birthSchema,
      ...chartSettingsSchema,
      ...timedSchema,
    }),
    func: async (input) => {
      try {
        const profile = _makeProfile('查询对象', input);
        const targetDate = targetInstant(input);
        const chart = astrologyService.computeChart({
          type: 'transit',
          primary: profile,
          settings: settingsFor(input),
          options: { targetDate },
        });
        return chartToolResult(chart, _serializeChart(chart), calculationFor(input, [profile], targetDate));
      } catch (e) {
        return `计算失败: ${e.message}`;
      }
    },
  });

  const computeSynastry = new DynamicStructuredTool({
    name: 'compute_synastry',
    description:
      '计算两人之间的合盘（比较盘），分析两人的关系相容性。需要两人的出生数据。',
    schema: z.object({
      ...chartSettingsSchema,
      year1: z.number().int().describe('第一人出生年份'),
      month1: z.number().int().min(1).max(12).describe('第一人出生月份'),
      day1: z.number().int().min(1).max(31).describe('第一人出生日期'),
      hour1: z.number().int().min(0).max(23).describe('第一人出生小时'),
      minute1: z.number().int().min(0).max(59).describe('第一人出生分钟'),
      latitude1: z.number().min(-90).max(90).describe('第一人出生地纬度'),
      longitude1: z.number().min(-180).max(180).describe('第一人出生地经度'),
      year2: z.number().int().describe('第二人出生年份'),
      month2: z.number().int().min(1).max(12).describe('第二人出生月份'),
      day2: z.number().int().min(1).max(31).describe('第二人出生日期'),
      hour2: z.number().int().min(0).max(23).describe('第二人出生小时'),
      minute2: z.number().int().min(0).max(59).describe('第二人出生分钟'),
      latitude2: z.number().min(-90).max(90).describe('第二人出生地纬度'),
      longitude2: z.number().min(-180).max(180).describe('第二人出生地经度'),
    }),
    func: async (input) => {
      try {
        const profileA = _makeProfile('A', {
          year: input.year1, month: input.month1, day: input.day1,
          hour: input.hour1, minute: input.minute1,
          latitude: input.latitude1, longitude: input.longitude1,
        });
        const profileB = _makeProfile('B', {
          year: input.year2, month: input.month2, day: input.day2,
          hour: input.hour2, minute: input.minute2,
          latitude: input.latitude2, longitude: input.longitude2,
        });
        const chart = astrologyService.computeChart({
          type: 'synastry', primary: profileA, secondary: profileB, settings: settingsFor(input),
        });
        return chartToolResult(chart, _serializeChart(chart), calculationFor(input, [profileA, profileB]));
      } catch (e) {
        return `计算失败: ${e.message}`;
      }
    },
  });

  const computeBazi = new DynamicStructuredTool({
    name: 'compute_bazi',
    description:
      '计算某人的八字命盘（四柱：年柱、月柱、日柱、时柱），返回天干地支、五行、生肖等信息。',
    schema: z.object(birthSchema),
    func: async (input) => {
      try {
        const result = chineseAstrologyService.computeBaZi({
          birthData: {
            year: input.year, month: input.month, day: input.day,
            hour: input.hour, minute: input.minute,
            location: {
              label: `${input.latitude},${input.longitude}`,
              latitude: input.latitude, longitude: input.longitude,
            },
          },
        });
        return baziToolResult(result, calculationFor(input, [_makeProfile('查询对象', input)]));
      } catch (e) {
        return `计算失败: ${e.message}`;
      }
    },
  });

  const computeSolarReturn = new DynamicStructuredTool({
    name: 'compute_solar_return',
    description:
      '计算某人的太阳返照盘（Solar Return），分析指定年份的年运主题。需要出生数据和目标年份。',
    schema: z.object({ ...birthSchema, ...chartSettingsSchema, targetYear: z.number().int().describe('返照年份') }),
    func: async (input) => {
      try {
        const profile = _makeProfile('查询对象', input);
        const chart = astrologyService.computeChart({
          type: 'solarReturn', primary: profile, settings: settingsFor(input), options: { year: input.targetYear },
        });
        return chartToolResult(chart, _serializeChart(chart), { ...calculationFor(input, [profile]), targetYear: input.targetYear });
      } catch (e) {
        return `计算失败: ${e.message}`;
      }
    },
  });

  const computeProgressed = new DynamicStructuredTool({
    name: 'compute_progressed',
    description:
      '计算某人的次限推运盘（Secondary Progressions），分析生命历程的内在发展。需要出生数据和目标日期。',
    schema: z.object({
      ...birthSchema,
      ...chartSettingsSchema,
      ...timedSchema,
    }),
    func: async (input) => {
      try {
        const profile = _makeProfile('查询对象', input);
        const targetDate = targetInstant(input);
        const chart = astrologyService.computeChart({
          type: 'progressed', primary: profile, settings: settingsFor(input), options: { targetDate },
        });
        return chartToolResult(chart, _serializeChart(chart), calculationFor(input, [profile], targetDate));
      } catch (e) {
        return `计算失败: ${e.message}`;
      }
    },
  });

  return decorateTools([
    computeNatalChart, computeTransit, computeSynastry,
    computeBazi, computeSolarReturn, computeProgressed,
  ], 'astro');
}

/**
 * Build the app-context introspection tools. These read live UI state from
 * AiService.getContext() (current route, active profile, last chart).
 *
 * @param {import('./AiService')} aiService
 * @returns {Promise<import('@langchain/core/tools').DynamicStructuredTool[]>}
 */
async function buildContextTools(aiService) {
  const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
  const z = require('zod');

  const getCurrentContext = new DynamicStructuredTool({
    name: 'get_current_context',
    description:
      '查询用户当前正在查看的页面和选中的档案信息。无需输入参数。返回当前路由、选中档案摘要、最后计算的星盘类型。',
    schema: z.object({}),
    func: async () => {
      const ctx = (aiService && aiService.getContext()) || {};
      const route = ctx.route || '未知';
      const profile = ctx.activeProfile;
      const chartType = ctx.chartType || '无';
      const lines = [`当前页面: ${route}`];
      if (profile) lines.push(`选中档案: ${profile.displayName || profile.nameZh || profile.nameEn || '未命名'}`);
      lines.push(`最后计算: ${chartType}`);
      return lines.join('\n');
    },
  });

  const getCurrentChart = new DynamicStructuredTool({
    name: 'get_current_chart',
    description:
      '获取用户当前打开的星盘完整数据（行星位置、宫位、相位等）。无需输入参数。如果用户尚未计算任何星盘，返回提示。',
    schema: z.object({}),
    func: async () => {
      const ctx = (aiService && aiService.getContext()) || {};
      if (ctx.kind === 'chinese-chart') return ctx.lastBaziData ? baziToolResult(ctx.lastBaziData) : '用户尚未计算八字命盘。';
      if (!ctx.lastChartData) return '用户尚未计算任何星盘。';
      return chartToolResult(ctx.lastChartData, _serializeCurrentChartContext(ctx));
    },
  });

  const getActiveProfile = new DynamicStructuredTool({
    name: 'get_active_profile',
    description:
      '获取当前选中档案的出生信息（姓名、性别、出生日期时间、出生地经纬度）。无需输入参数。',
    schema: z.object({}),
    func: async () => {
      const ctx = (aiService && aiService.getContext()) || {};
      const p = ctx.activeProfile;
      if (!p) return '当前没有选中的档案。';
      if (ctx.kind === 'western-chart') return p.displayName || p.nameZh || p.nameEn || p.id;
      const b = p.birthData || {};
      const loc = b.location || {};
      const genderZh = { male: '男', female: '女', other: '其他' }[p.gender] || '未知';
      return `${p.nameZh || p.nameEn || '未命名'}，性别${genderZh}，${b.year}年${b.month}月${b.day}日 ${b.hour}:${String(b.minute).padStart(2, '0')}，${loc.label || ''}（${loc.latitude}°N, ${loc.longitude}°E）`;
    },
  });

  const getCurrentTime = new DynamicStructuredTool({
    name: 'get_current_time',
    description:
      '获取当前真实的系统日期与时间（含星期、时区与 ISO 格式）。涉及“今天/现在/此刻/当前行运/最近天象/年龄”等与当前时间相关的问题时调用。无需输入参数。',
    schema: z.object({}),
    func: async () => {
      const now = aiService?.getNow?.() || new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const week = '日一二三四五六'[now.getDay()];
      const offsetH = -now.getTimezoneOffset() / 60;
      const tz = `UTC${offsetH >= 0 ? '+' : ''}${offsetH}`;
      return [
        `当前时间：${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} 星期${week}（${tz}）`,
        `ISO：${now.toISOString()}`,
      ].join('\n');
    },
  });

  return decorateTools([getCurrentContext, getCurrentChart, getActiveProfile, getCurrentTime], 'context');
}

/**
 * Backward-compatible aggregate: all astrology + context tools in one array.
 * New code should prefer the ToolRegistry + provider architecture.
 */
async function createTools(astrologyService, chineseAstrologyService, aiService) {
  return [
    ...(await buildComputeTools(astrologyService, chineseAstrologyService)),
    ...(await buildContextTools(aiService)),
  ];
}

module.exports = { createTools, buildComputeTools, buildContextTools };

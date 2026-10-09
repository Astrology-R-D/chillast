'use strict';

const { createHash } = require('node:crypto');
const { formatDegreeMinutes } = require('../../shared/DegreeFormat');
const hash = (text) => createHash('sha256').update(text).digest('hex');

/** Tool content enters the model; artifacts remain available to the app and history. */
function toolResult(content, kind, data, extra = {}) {
  return { content, artifact: { version: 1, kind, data, ...extra } };
}

function sourceSnapshot(doc) {
  const content = String(doc.content || '');
  const documentId = doc.documentId || `${doc.source || 'unknown'}:${doc.fileName || doc.url || ''}`;
  const version = hash(content);
  return {
    id: `S${hash(`${documentId}\n${content}`).slice(0, 20)}`,
    documentId, version, content,
    title: doc.title || doc.fileName || doc.url || '未标明来源',
    fileName: doc.fileName || '', source: doc.source || 'unknown',
    location: doc.location || null,
    ...(doc.url && /^https?:\/\//i.test(doc.url) ? { url: doc.url } : {}),
  };
}

function chartFacts(chart) {
  const facts = {};
  for (const ring of chart.rings || []) for (const p of ring.points || []) {
    facts[`${ring.id}:${p.key}`] = `${ring.label || ring.id} · ${p.nameZh || p.key} ${p.signNameZh || p.signKey || ''} ${formatDegreeMinutes(p.degreeInSign)} 第${p.house ?? '未知'}宫${p.retrograde ? ' 逆行' : ''}`;
  }
  for (const h of chart.houses || []) facts[`house:${h.index}`] = `第${h.index}宫宫头 ${h.signNameZh || ''} ${formatDegreeMinutes(h.degreeInSign)}`;
  for (const [i, a] of (chart.aspects || []).entries()) facts[`aspect:${i}`] = `${a.point1} ${a.nameZh || a.aspectKey} ${a.point2}，容许度 ${Number(a.orb).toFixed(2)}°`;
  return facts;
}

function chartToolResult(chart, content) {
  return toolResult(content, 'chart', chart, { facts: chartFacts(chart) });
}

function baziToolResult(result) {
  const p = result.bazi.pillars;
  const dm = result.bazi.dayMaster;
  const lines = [`八字四柱: ${p.year.full} ${p.month.full} ${p.day.full} ${p.hour.full}`, `日主: ${dm.char} (${dm.element})`];
  const a = result.analysis;
  if (a) {
    const labels = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' };
    lines.push('十神与藏干:');
    for (const pil of a.pillars) lines.push(`  ${labels[pil.key]}: ${pil.stemChar}[${pil.stemTenGod}] ${pil.branchChar} 藏干:${pil.hidden.map((h) => `${h.char}(${h.tenGod || '-'})`).join(' ')}`);
    const ec = a.elementCounts;
    lines.push(`五行统计(含藏干): 木${ec.wood} 火${ec.fire} 土${ec.earth} 金${ec.metal} 水${ec.water}`, `日主旺弱(参考): ${a.strength.label}`);
  }
  if (result.lunar) lines.push(`农历: ${result.lunar.lunarYear || ''} ${result.lunar.lunarMonth || ''}${result.lunar.lunarDay || ''}`);
  if (result.bazi.localTrueSolarTime) lines.push(`真太阳时: ${result.bazi.localTrueSolarTime}`);
  return toolResult(lines.join('\n'), 'bazi', result, { facts: Object.fromEntries(lines.map((line, index) => [`bazi:${index}`, line])) });
}

/** Works with ToolMessage artifacts and persisted AiToolCall records. */
function evidenceCatalog(calls) {
  const sources = new Map();
  const facts = new Map();
  for (const call of calls) {
    for (const source of call.artifact?.sources || []) sources.set(source.id, source);
    for (const [key, text] of Object.entries(call.artifact?.facts || {})) facts.set(`${call.callId}/${key}`, { callId: call.callId, key, text });
  }
  return { sources, facts };
}

function decorateTools(tools, providerId) {
  for (const tool of tools) {
    if (typeof tool.func !== 'function' || tool.responseFormat === 'content_and_artifact') continue;
    const original = tool.func.bind(tool);
    tool.responseFormat = 'content_and_artifact';
    tool.func = async (...args) => {
      const value = await original(...args);
      const result = value && typeof value === 'object' && value.artifact ? value
        : { content: typeof value === 'string' ? value : JSON.stringify(value), artifact: { version: 1, kind: 'generic', data: value } };
      return [result.content, { ...result.artifact, providerId, tool: tool.name }];
    };
  }
  return tools;
}

module.exports = { toolResult, sourceSnapshot, chartToolResult, chartFacts, baziToolResult, evidenceCatalog, decorateTools, hash };

'use strict';

const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const TAGS = {
  aspects: /相位|合相|四分|三分|对冲|aspect|conjunction|square|trine|opposition/i,
  'planets-houses': /宫位|落宫|第.{1,3}宫|house/i,
  'planets-signs': /星座|落座|白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼|zodiac|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces/i,
  transit: /行运|transit/i, synastry: /合盘|比较盘|synastry/i,
  retrograde: /逆行|retrograde/i, patterns: /格局|大三角|大十字|pattern|grand trine/i,
  bazi: /八字|十神|日主|天干|地支|四柱/i,
};
function contentType(heading) {
  if (/^(目录|目次|contents|table of contents)(?:\s|$)/i.test(heading.trim())) return 'toc';
  if (/版权|出版信息|copyright|出版说明/i.test(heading)) return 'frontmatter';
  if (/^(?:审订者序|译者序|序言|前言|序|preface|foreword|acknowledgments)$/i.test(heading.trim())) return 'preface';
  if (/摘要|概述|概览|总结|summary|overview/i.test(heading)) return 'overview';
  if (/案例|个案|命例|case study/i.test(heading)) return 'example';
  return 'body';
}
function tagsFor(text) { return Object.entries(TAGS).filter(([, rule]) => rule.test(text)).map(([tag]) => tag); }

// Derived metadata only: body bytes and order are never rewritten. Offsets use JS UTF-16.
function structureMarkdown(text, maxChars = 1000) {
  if (!Number.isInteger(maxChars) || maxChars < 100 || maxChars > 1000) throw new Error('分块大小必须为 100–1000 字符');
  const sections = [], chunks = [], stack = [];
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  let offset = 0, line = 1, fence = null;
  const begin = (title, level) => {
    if (sections.length) sections.at(-1).end = offset;
    while (stack.length && stack.at(-1).level >= level) stack.pop();
    const id = `H${hash(`${offset}:${title}`)}`;
    const parentId = stack.at(-1)?.id || null;
    const chapterPath = [...stack.map(s => s.title), title].filter(Boolean);
    const ownType = contentType(title);
    const type = ownType === 'body' && stack.at(-1)?.type && ['toc', 'frontmatter', 'preface'].includes(stack.at(-1).type) ? stack.at(-1).type : ownType;
    const section = { id, parentId, title, level, chapterPath, type, start: offset, end: text.length, lineStart: line };
    sections.push(section); stack.push(section);
  };
  for (const raw of lines) {
    const marker = raw.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1][0]; else if (marker[1][0] === fence) fence = null; }
    const heading = !fence && !marker && raw.match(/^(#{1,6})[ \t]+(.+?)\s*#*\s*$/);
    if (heading) begin(heading[2], heading[1].length);
    else if (!sections.length) begin('', 0);
    offset += raw.length; if (raw.endsWith('\n')) line++;
  }
  for (const section of sections) {
    section.tags = tagsFor(section.chapterPath.join(' ') + '\n' + text.slice(section.start, section.end));
    let start = section.start, currentLine = section.lineStart;
    while (start < section.end) {
      let end = Math.min(start + maxChars, section.end);
      if (end < section.end) {
        const window = text.slice(start, end), boundary = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'));
        if (boundary >= maxChars / 2) end = start + boundary + 1;
        if (/[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
      }
      const fragment = text.slice(start, end), count = (fragment.match(/\n/g) || []).length;
      chunks.push({ id: `K${hash(`${start}:${fragment}`)}`, sectionId: section.id, start, end,
        lineStart: currentLine, lineEnd: currentLine + count - (fragment.endsWith('\n') ? 1 : 0) });
      currentLine += count; start = end;
    }
  }
  for (let i = 0; i < chunks.length; i++) { chunks[i].previousId = chunks[i - 1]?.id || null; chunks[i].nextId = chunks[i + 1]?.id || null; }
  return { version: 1, algorithm: 'markdown-structure-v1', maxChars, sections, chunks };
}
function validateStructure(text, structure) {
  if (!structure || structure.version !== 1 || JSON.stringify(structure) !== JSON.stringify(structureMarkdown(text, structure.maxChars))) throw new Error('知识结构与正文不匹配');
  return structure;
}
module.exports = { structureMarkdown, validateStructure, contentType, tagsFor };

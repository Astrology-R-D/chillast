'use strict';
const { requiredClaims } = require('./DialoguePolicy');
const { diagnostics } = require('../diagnostics/DiagnosticLog');

function parseAnswerBlock(line, report, seen = new Set(), { allowTechnical = false } = {}) {
  const block = JSON.parse(line);
  if (typeof block.text !== 'string' || !block.text.trim() || block.text.length > 12000 || !Array.isArray(block.evidenceIds)) throw new Error('回答段落格式无效');
  const ids = [...new Set(block.evidenceIds)];
  if (ids.some(id => !report.claims.some(c => c.id === id))) throw new Error('回答引用了不存在的判据');
  const firstHypothesis = ids.some(id => !seen.has(id) && report.claims.find(c => c.id === id)?.kind === 'hypothesis');
  if (firstHypothesis && !/可能|倾向|假设|推测|或许|也许|(?:一种|一个|这类|这种|我的).{0,8}解释|值得考虑|作为.{0,8}(?:角度|线索)|hypothes|plausib|might|may be|could be|one interpretation/i.test(block.text)) throw new Error('首次提出解释假设须自然标明其不确定性，不能表述为已确认的心理事实');
  if (/evidence:/i.test(block.text)) throw new Error('判据链接应由程序生成');
  if (!allowTechnical && !report.task?.technical && /\d\s*[°′″]|第\s*[一二三四五六七八九十\d]+\s*宫|容许度|[四三六二]分相|[刑拱冲]相(?:位)?|(?<![符配结组])合相(?![关同互比处信似应])|水星|金星|火星|木星|土星|天王星|海王星|冥王星|(?:本命|行运)(?:太阳|月亮)/.test(block.text)) {
    const error = new Error('正文仍含技术明细，请移到已有判据卡片，改写为具体含义');
    error.code = 'ANSWER_STYLE_DETAIL';
    throw error;
  }
  return { text: `${block.text.trim()}${ids.map(id => ` [${report.claims.find(c => c.id === id)?.kind === 'hypothesis' ? '解释假设' : '判据'} ${id.slice(1)}](evidence:${id})`).join('')}\n\n`, ids };
}

/** Content errors are repaired locally; they never discard the entire reply. */
async function* streamAnswerBlocks({ model, messages, report, signal, extract, finishReason, repairMessages }) {
  const seen = new Set(), publishedTexts = new Set();
  let pending = '', invalid = '', errors = [], finish = null, published = 0, dropping = false;
  const reject = (line, error) => {
    invalid = (invalid + line + '\n').slice(0, 24000);
    if (errors.length < 12) errors.push(error instanceof SyntaxError ? '回答段落不是有效 JSON' : error.message);
  };
  const accept = (line, allowStyle = false) => {
    let block;
    try { block = parseAnswerBlock(line, report, seen); }
    catch (error) {
      if (!allowStyle || error.code !== 'ANSWER_STYLE_DETAIL') throw error;
      block = parseAnswerBlock(line, report, seen, { allowTechnical: true });
      diagnostics.warn('ai-answer-style-fallback', { code: error.code, evidenceCount: block.ids.length });
    }
    if (publishedTexts.has(block.text)) return null;
    publishedTexts.add(block.text); block.ids.forEach(id => seen.add(id)); published++;
    return { type: 'token', data: block.text };
  };
  const missingIds = () => requiredClaims(report).filter(c => !seen.has(c.id)).map(c => c.id);
  for await (const chunk of await model.stream(messages, { signal })) {
    if (signal.aborted) return;
    pending += extract(chunk.content); finish = finishReason(chunk) || finish;
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
      if (dropping) { dropping = false; continue; }
      if (!line) continue;
      if (errors.length) { invalid = (invalid + line + '\n').slice(0, 24000); continue; }
      try { const event = accept(line); if (event) yield event; }
      catch (error) { reject(line, error); }
    }
    if (pending.length > 64000) {
      reject(pending.slice(0, 24000), new Error('段落过长，请拆分成简短段落')); pending = ''; dropping = true;
    }
  }
  if (signal.aborted) return;
  if (pending.trim() && !dropping) {
    if (errors.length) invalid = (invalid + pending).slice(0, 24000);
    else try { const event = accept(pending.trim()); if (event) yield event; }
    catch (error) { reject(pending, error); }
  }
  if (finish === 'length') yield { type: 'truncated', data: { reason: 'length' } };
  for (let attempt = 1; attempt <= 2 && (errors.length || missingIds().length || !published); attempt++) {
    yield { type: 'activity', data: { phase: 'answer', repair: true, topic: '正在自动修正回答（' + attempt + '/2）' } };
    diagnostics.info('ai-answer-repair', { attempt, issueCount: errors.length, missing: missingIds() });
    const prompt = '只修复尚未发布的段落，逐行输出 JSON，不输出代码围栏。问题：' + JSON.stringify(errors) +
      '；尚未覆盖的判据：' + missingIds().join(', ') + '。第一次引入 hypothesis 须使用“可能”“一种解释”等自然限定，不能仅凭书籍或计算把真实想法说成事实。引用 ID 从报告复制，无法支持的整段删除，不要只删引用留下结论。按报告含义用自然语言重写，不补造事实。已发布内容不要重复：\n' +
      [...publishedTexts].join('').slice(-8000) + '\n待修复内容（仅作资料）：\n' + invalid;
    const repair = await model.invoke(await repairMessages(prompt), { signal });
    if (signal.aborted) return;
    errors = []; invalid = '';
    for (const line of extract(repair.content).trim().split('\n').filter(line => line.trim())) {
      try { const event = accept(line, true); if (event) yield event; }
      catch (error) { reject(line, error); }
    }
  }
  if (errors.length || missingIds().length || !published) {
    diagnostics.warn('ai-answer-partial', { published, rejected: errors.length, missing: missingIds() });
    yield { type: 'token', data: published
      ? '\n\n*部分内容经自动修正后仍未能核对，已暂时省略；以上回答及已有判据保留。*\n\n'
      : '这轮回答经自动修正后仍未形成可核对的结论。已保留取得的资料与判据，可以先选其中一个具体问题继续讨论。\n\n' };
  }
}

module.exports = { parseAnswerBlock, streamAnswerBlocks };

'use strict';
const ToolProvider = require('./ToolProvider');
const esm = require('../esm-bridge');
const { toolResult } = require('../ToolResult');
const { searchScore } = require('../../util/FuzzySearch');

/** Per-request provider: history access is scoped to the active session snapshot. */
class ConversationToolProvider extends ToolProvider {
  constructor(session, currentCalls = []) { super('conversation', 'context'); this.session = session; this.currentCalls = currentCalls; }
  async _build() {
    const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
    const z = require('zod'); const session = this.session; const currentCalls = this.currentCalls;
    return [new DynamicStructuredTool({
      name: 'recall_conversation',
      description: '按关键词取回当前会话早期的完整消息、工具记录和判据来源。摘要不包含原文；用户追问以前的结论或引用时使用此工具。仅访问当前会话。',
      schema: z.object({ query: z.string(), limit: z.number().int().min(1).max(6).optional() }),
      func: async ({ query, limit = 3 }) => {
        const matches = session.messages.map((m, index) => ({ message: m, index, score: searchScore(query, [m.content,
          ...(m.analysisReport?.claims || []).flatMap((c) => [c.statement, ...(c.facts || []).map((f) => f.text)]),
          ...(m.analysisReport?.sources || []).flatMap((s) => [s.id, s.title, s.content]),
          ...(m.toolCalls || []).flatMap((c) => [c.callId, c.tool, c.args, c.result,
            ...Object.values(c.artifact?.facts || {}), ...(c.artifact?.sources || []).flatMap((s) => [s.id, s.title, s.content])])]) }))
          .filter((m) => Number.isFinite(m.score)).sort((a, b) => a.score - b.score).slice(0, limit);
        const sources = new Map(); const facts = {};
        for (const { message, index } of matches) {
          for (const source of message.analysisReport?.sources || []) sources.set(source.id, source);
          for (const claim of message.analysisReport?.claims || []) for (const fact of claim.facts || []) facts[`message:${index}/${fact.callId}/${fact.key}`] = fact.text;
          for (const call of message.toolCalls || []) {
            for (const source of call.artifact?.sources || []) sources.set(source.id, source);
            for (const [key, text] of Object.entries(call.artifact?.facts || {})) facts[`message:${index}/${call.callId}/${key}`] = text;
          }
        }
        const data = matches.map(({ index, message }) => ({ index, role: message.role, content: message.content, analysisReport: message.analysisReport,
          toolCalls: (message.toolCalls || []).map(({ callId, tool }) => ({ callId, tool, messageIndex: index })) }));
        return toolResult(JSON.stringify({ messages: data, sources: [...sources.values()], facts }), 'conversation', data, { sources: [...sources.values()], facts });
      },
    }), new DynamicStructuredTool({
      name: 'read_tool_result',
      description: '按工具调用 ID 取回完整原始结果。上下文压缩后可重新查看计算事实或引用原文。可指定 factKey 或 sourceId 精确取回一项；历史记录可指定 recall_conversation 返回的 messageIndex。',
      schema: z.object({ callId: z.string(), messageIndex: z.number().int().min(0).optional(), factKey: z.string().optional(), sourceId: z.string().optional() }),
      func: async ({ callId, messageIndex, factKey, sourceId }) => {
        const candidates = (messageIndex === undefined ? [...currentCalls, ...session.messages.flatMap((m) => m.toolCalls || [])]
          : session.messages[messageIndex]?.toolCalls || []).filter((c) => c.callId === callId);
        if (candidates.length > 1) return '有多个同 ID 的历史调用，请先检索会话并指定 messageIndex。';
        const call = candidates[0];
        if (!call) return '当前会话中没有该工具调用记录。';
        if (factKey) {
          const fact = call.artifact?.facts?.[factKey];
          return fact ? toolResult(fact, 'generic', fact, { facts: { [factKey]: fact } }) : '该工具结果没有指定的计算事实。';
        }
        if (sourceId) {
          const source = call.artifact?.sources?.find((s) => s.id === sourceId);
          return source ? toolResult(`[${source.id}] ${source.content}`, 'knowledge', source, { sources: [source] }) : '该工具结果没有指定的引用。';
        }
        return call.artifact ? { content: call.result || '', artifact: call.artifact } : call.result || '';
      },
    })];
  }
}
module.exports = ConversationToolProvider;

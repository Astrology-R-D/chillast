'use strict';

// DeepSeek documents 384K as exactly 393216, including the retired Flash aliases.
// https://api-docs.deepseek.com/api/create-chat-completion/
const DEEPSEEK_MODELS = new Set(['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-v4-pro']);
const positive = (value) => Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

function modelTokenLimits(settings, catalogModel) {
  const official = settings.provider === 'deepseek' && DEEPSEEK_MODELS.has(settings.model);
  const context = official ? 1000000 : positive(catalogModel?.limitContext);
  const output = official ? 393216 : positive(catalogModel?.limitOutput);
  const override = (value, limit) => positive(value) ? Math.min(positive(value), limit || Infinity) : limit;
  return { context: override(settings.contextWindow, context), output: override(settings.maxOutputTokens, output) };
}

function estimateInputTokens(messages, tools = []) {
  // UTF-8 bytes give a conservative text estimate without assuming an OpenAI tokenizer.
  // Include framing, tool schemas, arguments and results for every agent iteration.
  const bytes = (value) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value ?? '')).length;
  return messages.reduce((total, message) => total + bytes({ content: message.content, tool_calls: message.tool_calls, name: message.name, role: message.role }) + 128, 0)
    + bytes(tools);
}

function resolveTokenBudget(settings, limits, messages = [], tools = []) {
  const requested = positive(settings.maxTokens);
  if (settings.maxTokensMode === 'context' || limits.context) {
    if (!limits.context) throw new Error('自动预算需要模型上下文窗口，请在 AI 设置中填写。');
    const remaining = limits.context - estimateInputTokens(messages, tools) - Math.max(1024, Math.ceil(limits.context * 0.005));
    if (remaining < 1) throw new Error('当前对话与工具结果已超出上下文预算，请新建对话或调整上下文参数。');
    return Math.min(remaining, limits.output || Infinity, requested || Infinity);
  }
  if (requested) return Math.min(requested, limits.output || Infinity);
  // Zero removes the app's extra cap. Unknown providers retain their server default.
  if (settings.maxTokens === 0) return limits.output || undefined;
  return limits.output || 8192;
}

module.exports = { modelTokenLimits, estimateInputTokens, resolveTokenBudget };

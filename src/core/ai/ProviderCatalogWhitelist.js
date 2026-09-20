'use strict';

/**
 * Settings-UI provider whitelist, mapped onto the models.dev community
 * catalog (assets/catalog-snapshot.json). `key` is the persisted provider id
 * in ai-settings.json — legacy keys (moonshot/tongyi/…) are intentionally
 * kept so stored settings survive upgrades; `catalogId` locates the entry in
 * the models.dev snapshot. `engine` picks the LangChain chat class family:
 *   openai        → ChatOpenAI (native endpoint, no baseURL)
 *   anthropic     → ChatAnthropic
 *   openai_compat → ChatOpenAI + baseURL (catalog api, or user-provided)
 *   ollama        → ChatOllama (local inference, never in the catalog)
 */
const PROVIDER_WHITELIST = [
  { key: 'openai', label: 'OpenAI', catalogId: 'openai', engine: 'openai', needsKey: true },
  { key: 'anthropic', label: 'Anthropic Claude', catalogId: 'anthropic', engine: 'anthropic', needsKey: true },
  { key: 'deepseek', label: 'DeepSeek', catalogId: 'deepseek', engine: 'openai_compat', needsKey: true },
  { key: 'moonshot', label: 'Moonshot 月之暗面', catalogId: 'moonshotai-cn', engine: 'openai_compat', needsKey: true },
  { key: 'zhipuai', label: 'ZhipuAI 智谱', catalogId: 'zhipuai', engine: 'openai_compat', needsKey: true },
  { key: 'tongyi', label: 'Tongyi 通义千问', catalogId: 'alibaba-cn', engine: 'openai_compat', needsKey: true },
  { key: 'minimax', label: 'MiniMax', catalogId: 'minimax-cn', engine: 'anthropic', needsKey: true },
  { key: 'volcengine', label: '火山方舟', catalogId: 'volcengine', engine: 'openai_compat', needsKey: true },
  { key: 'siliconflow', label: '硅基流动 SiliconFlow', catalogId: 'siliconflow-cn', engine: 'openai_compat', needsKey: true },
  { key: 'stepfun', label: '阶跃星辰 StepFun', catalogId: 'stepfun', engine: 'openai_compat', needsKey: true },
  { key: 'openrouter', label: 'OpenRouter', catalogId: 'openrouter', engine: 'openai_compat', needsKey: true },
  { key: 'ollama', label: 'Ollama (本地)', catalogId: null, engine: 'ollama', needsKey: false },
  { key: 'openai_compat', label: 'OpenAI 兼容端点', catalogId: null, engine: 'openai_compat', needsKey: true },
];

// 持久化 key 的稳定性是本表的契约，冻结防止下游意外改写
for (const entry of PROVIDER_WHITELIST) Object.freeze(entry);
Object.freeze(PROVIDER_WHITELIST);

/** Case-insensitive whitelist lookup. Unknown keys → null. */
function resolveProviderEntry(rawKey) {
  const key = String(rawKey || '').trim().toLowerCase();
  return PROVIDER_WHITELIST.find((e) => e.key === key) || null;
}

module.exports = { PROVIDER_WHITELIST, resolveProviderEntry };

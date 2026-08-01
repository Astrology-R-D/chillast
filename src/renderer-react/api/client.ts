import type { AiStatus, AppConfig, IpcResult, LocaleDictionary } from './contracts';

export function parseAiStatus(value: unknown): AiStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI 状态数据无效');
  }

  const status = value as Record<string, unknown>;
  const optionalNumberIsValid = (field: string) =>
    status[field] === undefined
    || (typeof status[field] === 'number' && Number.isFinite(status[field]));
  if (
    typeof status.configured !== 'boolean'
    || typeof status.provider !== 'string'
    || typeof status.model !== 'string'
    || typeof status.baseUrl !== 'string'
    || typeof status.knowledgeDocCount !== 'number'
    || !Number.isFinite(status.knowledgeDocCount)
    || status.knowledgeDocCount < 0
    || !optionalNumberIsValid('temperature')
    || !optionalNumberIsValid('maxTokens')
  ) {
    throw new Error('AI 状态数据无效');
  }

  return {
    configured: status.configured,
    provider: status.provider,
    model: status.model,
    baseUrl: status.baseUrl,
    temperature: status.temperature,
    maxTokens: status.maxTokens,
    knowledgeDocCount: status.knowledgeDocCount,
  } as AiStatus;
}

export function unwrap<T>(result: unknown): T {
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error('未知错误');
  }

  if (result.ok === true && 'data' in result) {
    return result.data as T;
  }

  if (result.ok === false) {
    const error = 'error' in result && typeof result.error === 'string' ? result.error : '';
    throw new Error(error || '未知错误');
  }

  throw new Error('未知错误');
}

async function invoke<T>(request: (api: MystApi) => Promise<IpcResult<T>>): Promise<T> {
  return unwrap<T>(await request(window.mystApi));
}

export const apiClient = {
  getConfig: (): Promise<AppConfig> => invoke((api) => api.getConfig()),
  getLocale: (): Promise<LocaleDictionary> => invoke((api) => api.getLocale()),
  getAiStatus: async (): Promise<AiStatus> =>
    parseAiStatus(await invoke<unknown>((api) => api.ai.status())),
};

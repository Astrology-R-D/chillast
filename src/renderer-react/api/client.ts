import type { AiStatus, AppConfig, IpcResult, LocaleDictionary } from './contracts';

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
  getAiStatus: (): Promise<AiStatus> => invoke((api) => api.ai.status()),
};

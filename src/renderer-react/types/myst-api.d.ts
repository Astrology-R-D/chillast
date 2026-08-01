import type {
  AiInitProgress,
  AppConfig,
  IpcResult,
  LocaleDictionary,
} from '../api/contracts';

declare global {
  interface MystAiApi {
    status(): Promise<IpcResult<unknown>>;
    initStatus(): Promise<IpcResult<AiInitProgress | null>>;
    onStatusChanged(callback: (status: unknown) => void): () => void;
    onInitProgress(callback: (progress: AiInitProgress) => void): () => void;
  }

  interface MystApi {
    getConfig(): Promise<IpcResult<AppConfig>>;
    getLocale(): Promise<IpcResult<LocaleDictionary>>;
    ai: MystAiApi;
  }

  interface Window {
    mystApi: MystApi;
  }
}

export {};

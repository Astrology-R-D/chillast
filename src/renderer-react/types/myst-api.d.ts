import type {
  AiInitProgress,
  AiStatus,
  AppConfig,
  IpcResult,
  LocaleDictionary,
} from '../api/contracts';

declare global {
  interface MystAiApi {
    status(): Promise<IpcResult<AiStatus>>;
    initStatus(): Promise<IpcResult<AiInitProgress | null>>;
    onStatusChanged(callback: (status: AiStatus) => void): () => void;
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

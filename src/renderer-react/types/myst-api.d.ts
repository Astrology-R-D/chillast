import type {
  AiInitProgress,
  AiStatus,
  AppConfig,
  IpcResult,
  LocaleDictionary,
} from '../api/contracts';

declare global {
  type MystApiListenerRegistration = object;

  interface MystAiApi {
    status(): Promise<IpcResult<AiStatus>>;
    initStatus(): Promise<IpcResult<AiInitProgress | null>>;
    onStatusChanged(callback: (status: AiStatus) => void): MystApiListenerRegistration;
    onInitProgress(callback: (progress: AiInitProgress) => void): MystApiListenerRegistration;
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

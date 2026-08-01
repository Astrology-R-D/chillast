import type {
  AiInitProgress,
  AppConfig,
  CloseDecision,
  IpcResult,
  LocaleDictionary,
  ProfileSaveInput,
  ResolveLocationInput,
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
    profiles: {
      list(): Promise<IpcResult<unknown>>;
      get(id: string): Promise<IpcResult<unknown>>;
      save(profile: ProfileSaveInput): Promise<IpcResult<unknown>>;
      remove(id: string): Promise<IpcResult<unknown>>;
    };
    searchCities(query: string): Promise<IpcResult<unknown>>;
    chinese: {
      searchCities(query: string): Promise<IpcResult<unknown>>;
    };
    locations: {
      resolve(input: ResolveLocationInput): Promise<IpcResult<unknown>>;
    };
    app: {
      onCloseRequested(callback: () => void): () => void;
      decideClose(decision: CloseDecision): Promise<IpcResult<unknown>>;
    };
    ai: MystAiApi;
  }

  interface Window {
    mystApi: MystApi;
  }
}

export {};

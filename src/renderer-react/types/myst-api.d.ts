import type {
  AiInitProgress,
  AppConfig,
  CloseDecision,
  IpcResult,
  LocaleDictionary,
  LocationResolution,
  Profile,
  ProfileSaveInput,
  ResolveLocationInput,
} from '../api/contracts';
import type { ChartRequest } from '../features/charts/contracts';

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
    getReferenceData(): Promise<IpcResult<unknown>>;
    getChartTypes(): Promise<IpcResult<unknown>>;
    computeChart(request: ChartRequest): Promise<IpcResult<unknown>>;
    profiles: {
      list(): Promise<IpcResult<Profile[]>>;
      get(id: string): Promise<IpcResult<Profile | null>>;
      save(profile: ProfileSaveInput): Promise<IpcResult<Profile>>;
      remove(id: string): Promise<IpcResult<boolean>>;
    };
    searchCities(query: string): Promise<IpcResult<unknown[]>>;
    chinese: {
      searchCities(query: string): Promise<IpcResult<unknown[]>>;
    };
    locations: {
      resolve(input: ResolveLocationInput): Promise<IpcResult<LocationResolution>>;
    };
    app: {
      onCloseRequested(callback: () => void): () => void;
      decideClose(decision: CloseDecision): Promise<IpcResult<boolean>>;
    };
    ai: MystAiApi;
  }

  interface Window {
    mystApi: MystApi;
  }
}

export {};

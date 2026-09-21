import type {
  AiCatalogModel,
  AiCatalogProvider,
  AiInitProgress,
  AiMcpInfo,
  AiSessionSummary,
  AiSettingsInput,
  AiToolProviderDescriptor,
  AppConfig,
  CloseDecision,
  IpcResult,
  KnowledgeDoc,
  LocaleDictionary,
  LocationResolution,
  Profile,
  ProfileSaveInput,
  ResolveLocationInput,
  WesternChartAiContext,
} from '../api/contracts';
import type { ChartRequest } from '../features/charts/contracts';

declare global {
  interface MystAiApi {
    status(): Promise<IpcResult<unknown>>;
    initStatus(): Promise<IpcResult<AiInitProgress | null>>;
    onStatusChanged(callback: (status: unknown) => void): () => void;
    onInitProgress(callback: (progress: AiInitProgress) => void): () => void;
    setContext(context: WesternChartAiContext | null): Promise<IpcResult<unknown>>;
    configure(settings: AiSettingsInput): Promise<IpcResult<unknown>>;
    testWithSettings(settings: AiSettingsInput): Promise<IpcResult<unknown>>;
    catalog: {
      providers(): Promise<IpcResult<AiCatalogProvider[]>>;
      models(providerKey: string): Promise<IpcResult<AiCatalogModel[]>>;
    };
    knowledge: {
      list(): Promise<IpcResult<KnowledgeDoc[]>>;
      import(filePaths: string[]): Promise<IpcResult<{ count: number }>>;
      remove(docId: string): Promise<IpcResult<boolean>>;
    };
    tools: {
      describe(): Promise<IpcResult<AiToolProviderDescriptor[]>>;
      setProviderEnabled(id: string, enabled: boolean): Promise<IpcResult<unknown>>;
    };
    mcp: {
      list(): Promise<IpcResult<AiMcpInfo>>;
      save(servers: AiMcpInfo['servers']): Promise<IpcResult<unknown>>;
    };
    sessions: {
      list(): Promise<IpcResult<AiSessionSummary[]>>;
      rename(id: string, title: string): Promise<IpcResult<unknown>>;
      generateTitle(id: string): Promise<IpcResult<{ title: string }>>;
      delete(id: string): Promise<IpcResult<boolean>>;
    };
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

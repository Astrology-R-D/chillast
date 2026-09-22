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
    readTextAttachment(filePath: string): Promise<IpcResult<{ name: string; content: string }>>;
    chat(messages: Array<{ role: string; content: string; attachments?: Array<{ name: string; content: string }> }>, context: { sessionId?: string; resend?: boolean; [key: string]: unknown }): Promise<IpcResult<unknown>>;
    interpret(chartData: unknown, options: { sessionId?: string; chartType?: string; [key: string]: unknown }): Promise<IpcResult<unknown>>;
    stop(sessionId: string): Promise<IpcResult<unknown>>;
    onToken(callback: (event: { sessionId?: string; type: string; data: unknown }) => void): void;
    onDone(callback: (event: { ok?: boolean; sessionId?: string }) => void): void;
    onError(callback: (event: { message?: string; sessionId?: string }) => void): void;
    removeAllListeners(): void;
    onSessionsChanged(callback: () => void): void;
    configure(settings: AiSettingsInput): Promise<IpcResult<unknown>>;
    testWithSettings(settings: AiSettingsInput): Promise<IpcResult<unknown>>;
    catalog: {
      providers(): Promise<IpcResult<AiCatalogProvider[]>>;
      models(providerKey: string): Promise<IpcResult<AiCatalogModel[]>>;
    };
    knowledge: {
      list(): Promise<IpcResult<KnowledgeDoc[]>>;
      import(filePaths: string[]): Promise<IpcResult<{ count: number }>>;
      remove(docId: string): Promise<IpcResult<{ removed: boolean }>>;
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
      fork(sessionId: string, messageIndex: number): Promise<IpcResult<AiSessionSummary>>;
      setPinned(sessionId: string, pinned: boolean): Promise<IpcResult<AiSessionSummary>>;
      create(): Promise<IpcResult<AiSessionSummary>>;
      replaceFrom(sessionId: string, messageIndex: number, message: { role: string; content: string }): Promise<IpcResult<AiSessionSummary>>;
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

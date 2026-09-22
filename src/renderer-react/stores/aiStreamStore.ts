import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type AiWorkspaceMode = 'chat' | 'report' | 'research';
export type StreamKind = 'chat' | 'interpret';

export interface StreamToolEvent {
  tool: string;
  status: 'calling' | 'done';
  argsDigest: string;
  resultExcerpt: string;
  requiresConfirmation: boolean;
}

export type StreamSegment =
  | { kind: 'text'; content: string }
  | { kind: 'tool'; event: StreamToolEvent };

export interface StreamUserMessage {
  role: string;
  content: string;
  attachments: Array<{ name: string; content: string }>;
}

export interface AiStreamState {
  mode: AiWorkspaceMode;
  panelOpenSignal: number;
  activeSessionId: string | null;
  active: boolean;
  streamKind: StreamKind | null;
  localUserMessage: StreamUserMessage | null;
  segments: StreamSegment[];
  truncated: boolean;
  error: string | null;
  autoScrollPaused: boolean;
  /** 每次 ai:done / ai:error / stop +1；ChatMode 依此 invalidate 会话列表。 */
  streamFinishSignal: number;
  setMode(mode: AiWorkspaceMode): void;
  requestPanelOpen(): void;
  setActiveSessionId(id: string | null): void;
  setAutoScrollPaused(paused: boolean): void;
  startChat(message: { role: string; content: string; attachments?: Array<{ name: string; content: string }> }, options?: { resend?: boolean }): void;
  startInterpret(request: { chartData: unknown; chartType?: string }): void;
  stopStream(): void;
  /** 消费一条 ai:token 通道事件（导出供测试直接驱动）。 */
  consumeStreamEvent(event: { sessionId?: string; type: string; data: unknown }): void;
  /** 内部：流收尾（ai:done / ai:error / stop 调用）；导出供实现内部与测试。 */
  consumeFinish(errorMessage?: string): void;
  resetForTests(): void;
}

function isToolEvent(value: unknown): value is StreamToolEvent {
  return Boolean(value) && typeof value === 'object'
    && typeof (value as StreamToolEvent).tool === 'string'
    && ((value as StreamToolEvent).status === 'calling' || (value as StreamToolEvent).status === 'done');
}

export function createAiStreamStore(): StoreApi<AiStreamState> {
  return createStore<AiStreamState>((set, get) => {
    const registerStreamListeners = (): void => {
      const api = window.mystApi.ai;
      api.removeAllListeners();
      api.onToken((event) => { get().consumeStreamEvent(event); });
      api.onDone(() => { get().consumeFinish(); });
      api.onError((event) => { get().consumeFinish(event?.message ?? 'AI 请求失败'); });
    };
    const startStream = (patch: Partial<AiStreamState>): void => {
      if (get().active) return;
      set({ active: true, segments: [], truncated: false, error: null, localUserMessage: null, autoScrollPaused: false, ...patch });
      registerStreamListeners();
    };
    return {
      mode: 'chat',
      panelOpenSignal: 0,
      activeSessionId: null,
      active: false,
      streamKind: null,
      localUserMessage: null,
      segments: [],
      truncated: false,
      error: null,
      autoScrollPaused: false,
      streamFinishSignal: 0,
      setMode: (mode) => set({ mode }),
      requestPanelOpen: () => set((state) => ({ panelOpenSignal: state.panelOpenSignal + 1 })),
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
      setAutoScrollPaused: (autoScrollPaused) => set({ autoScrollPaused }),
      startChat(message, options) {
        const sessionId = get().activeSessionId;
        if (!sessionId || get().active) return;
        startStream({
          streamKind: 'chat',
          localUserMessage: { role: message.role, content: message.content, attachments: message.attachments ?? [] },
        });
        void window.mystApi.ai.chat([message], { sessionId, resend: options?.resend ?? false });
      },
      startInterpret(request) {
        const sessionId = get().activeSessionId;
        if (!sessionId || get().active) return;
        startStream({ streamKind: 'interpret', mode: 'chat' });
        void window.mystApi.ai.interpret(request.chartData, { chartType: request.chartType, sessionId });
      },
      stopStream() {
        const state = get();
        if (!state.active) return;
        if (state.activeSessionId) void window.mystApi.ai.stop(state.activeSessionId);
        get().consumeFinish();
      },
      consumeStreamEvent(event) {
        const state = get();
        if (!state.active) return;
        if (state.streamKind === 'chat' && event.sessionId && state.activeSessionId
          && event.sessionId !== state.activeSessionId) return;
        if (event.type === 'token' && typeof event.data === 'string') {
          const segments = [...state.segments];
          const last = segments[segments.length - 1];
          if (last && last.kind === 'text') segments[segments.length - 1] = { kind: 'text', content: last.content + event.data };
          else segments.push({ kind: 'text', content: event.data });
          set({ segments });
          return;
        }
        if (event.type === 'tool-call' && isToolEvent(event.data)) {
          const toolEvent = event.data;
          const segments = [...state.segments];
          if (toolEvent.status === 'calling') {
            segments.push({ kind: 'tool', event: toolEvent });
          } else {
            for (let index = segments.length - 1; index >= 0; index -= 1) {
              const segment = segments[index];
              if (segment.kind === 'tool' && segment.event.tool === toolEvent.tool && segment.event.status === 'calling') {
                // done 事件只补状态与结果摘录；argsDigest 保留 calling 段的值
                //（主进程 done 分支固定发 argsDigest: ''，直接 spread 会把它清掉）。
                segments[index] = { kind: 'tool', event: {
                  ...segment.event,
                  status: toolEvent.status,
                  resultExcerpt: toolEvent.resultExcerpt,
                  requiresConfirmation: toolEvent.requiresConfirmation,
                } };
                break;
              }
            }
          }
          set({ segments });
          return;
        }
        if (event.type === 'truncated') set({ truncated: true });
        // AiService 的 { type: 'done' } 事件与其它未知类型：忽略（完成由 ai:done 通道驱动）。
      },
      consumeFinish(errorMessage) {
        const state = get();
        if (!state.active) return;
        window.mystApi.ai.removeAllListeners();
        set({
          active: false,
          streamKind: null,
          segments: [],
          localUserMessage: null,
          truncated: false,
          error: errorMessage ?? state.error,
          streamFinishSignal: state.streamFinishSignal + 1,
        });
      },
      resetForTests() {
        set({
          mode: 'chat', panelOpenSignal: 0, activeSessionId: null, active: false, streamKind: null,
          localUserMessage: null, segments: [], truncated: false, error: null, autoScrollPaused: false,
          streamFinishSignal: 0,
        });
      },
    };
  });
}

export const aiStreamStore = createAiStreamStore();

export function resetAiStreamStoreForTests(): void {
  aiStreamStore.getState().resetForTests();
}

/** 组件订阅入口（与 `useChartWorkspace` 同款：zustand useStore + vanilla store）。 */
export function useAiStreamStore<T>(selector: (state: AiStreamState) => T): T {
  return useStore(aiStreamStore, selector);
}

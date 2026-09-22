import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { apiClient } from '../../api/client';
import { aiStreamStore, useAiStreamStore } from '../../stores/aiStreamStore';
import { buildChatMessageContent, lastUserMessageIndex, type ChatAttachment } from './chatMessage';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

export function ChatMode({ statusChip }: { statusChip?: string | null }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const activeSessionId = useAiStreamStore((state) => state.activeSessionId);
  const streamFinishSignal = useAiStreamStore((state) => state.streamFinishSignal);
  const [quoteDraft, setQuoteDraft] = useState('');
  const sessionsQuery = useQuery({ queryKey: ['ai-sessions'], queryFn: apiClient.listAiSessions });
  const sessions = sessionsQuery.data ?? [];
  const messages = (sessions.find((session) => session.id === activeSessionId)?.messages) ?? [];

  // 流结束（含 stop/error）后刷新会话列表，让历史替代本地流缓冲。
  useEffect(() => {
    if (streamFinishSignal === 0) return;
    void queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
  }, [queryClient, streamFinishSignal]);

  const send = (text: string, attachments: ChatAttachment[]) => {
    aiStreamStore.getState().startChat({ role: 'user', content: buildChatMessageContent(text, attachments), attachments });
  };

  /** 编辑重发：末条 user 原地改写；非末条 → fork 派生会话再改写（spec §2/§4）。 */
  const editResend = async (index: number, nextContent: string) => {
    if (!activeSessionId) return;
    const isLastUser = !messages.slice(index + 1).some((message) => message.role === 'user');
    let sessionId = activeSessionId;
    if (!isLastUser) {
      const forked = await apiClient.forkAiSession(activeSessionId, index);
      sessionId = forked.id;
      aiStreamStore.getState().setActiveSessionId(sessionId);
      await queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
    }
    await apiClient.replaceAiSessionFrom(sessionId, index, { role: 'user', content: nextContent });
    aiStreamStore.getState().startChat({ role: 'user', content: nextContent }, { resend: true });
  };

  /** 重新生成 / 错误重试共用：改写末条 user（截断其后）+ resend。 */
  const regenerate = async () => {
    if (!activeSessionId) return;
    const index = lastUserMessageIndex(messages);
    if (index < 0) return;
    const content = messages[index].content;
    await apiClient.replaceAiSessionFrom(activeSessionId, index, { role: 'user', content });
    aiStreamStore.getState().startChat({ role: 'user', content }, { resend: true });
  };

  const fork = async (index: number) => {
    if (!activeSessionId) return;
    const forked = await apiClient.forkAiSession(activeSessionId, index);
    aiStreamStore.getState().setActiveSessionId(forked.id);
    await queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
  };

  const copy = async (content: string) => { try { await navigator.clipboard.writeText(content); } catch { /* 剪贴板不可用时静默 */ } };
  const quote = (content: string) => {
    setQuoteDraft(`${content.split('\n').map((line) => `> ${line}`).join('\n')}\n\n`);
  };

  const lastUser = lastUserMessageIndex(messages);
  const streamActive = useAiStreamStore((state) => state.active);
  const canRegenerate = !streamActive && lastUser >= 0;

  return (
    <section className="chat-mode" aria-label={t('ai.modeChat')}>
      <MessageList messages={messages} canRegenerate={canRegenerate}
        onCopy={(content) => { void copy(content); }} onQuote={quote}
        onEditResend={(index, next) => { void editResend(index, next); }}
        onFork={(index) => { void fork(index); }}
        onRegenerate={() => { void regenerate(); }}
        onRetry={() => { void regenerate(); }} />
      <Composer statusChip={statusChip} onSend={send} onStop={() => aiStreamStore.getState().stopStream()}
        quoteDraft={quoteDraft} onQuoteConsumed={() => setQuoteDraft('')} />
    </section>
  );
}

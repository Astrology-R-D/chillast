import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { AiSessionSummary } from '../../api/contracts';
import { useAiStreamStore } from '../../stores/aiStreamStore';
import { MarkdownMessage } from './MarkdownMessage';
import { MessageItem } from './MessageItem';

const PAUSE_THRESHOLD_PX = 40;

export interface MessageListProps {
  messages: AiSessionSummary['messages'];
  /** 是否给 assistant 末条挂「重新生成」。 */
  canRegenerate?: boolean;
  onCopy?(content: string): void;
  onQuote?(content: string): void;
  onEditResend?(index: number, nextContent: string): void;
  onFork?(index: number): void;
  onRegenerate?(): void;
  /** 流错误后的行内重试。 */
  onRetry?(): void;
}

export function MessageList({ messages, canRegenerate, onCopy, onQuote, onEditResend, onFork, onRegenerate, onRetry }: MessageListProps) {
  const { t } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const active = useAiStreamStore((state) => state.active);
  const localUserMessage = useAiStreamStore((state) => state.localUserMessage);
  const segments = useAiStreamStore((state) => state.segments);
  const truncated = useAiStreamStore((state) => state.truncated);
  const error = useAiStreamStore((state) => state.error);
  const autoScrollPaused = useAiStreamStore((state) => state.autoScrollPaused);
  const setAutoScrollPaused = useAiStreamStore((state) => state.setAutoScrollPaused);

  const lastAssistantIndex = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role !== 'user') return index;
    }
    return -1;
  })();

  useEffect(() => {
    if (autoScrollPaused) return;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [autoScrollPaused, messages, segments, truncated, error, localUserMessage]);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const paused = distance > PAUSE_THRESHOLD_PX;
    if (paused !== autoScrollPaused) setAutoScrollPaused(paused);
  };

  const backToLatest = () => {
    setAutoScrollPaused(false);
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  return (
    <div className="message-list">
      <div ref={scrollerRef} className="message-list__scroller" role="log" aria-label={t('ai.messagesRegion')} onScroll={handleScroll}>
        {messages.length === 0 && !active && <div className="message-list__empty">{t('ai.noMessages')}</div>}
        {messages.map((message, index) => (
          <MessageItem key={index} index={index} message={message} disabled={active}
            onCopy={onCopy} onQuote={onQuote} onEditResend={onEditResend} onFork={onFork}
            onRegenerate={canRegenerate && index === lastAssistantIndex && !active ? onRegenerate : undefined} />
        ))}
        {active && (
          <div className="message-list__stream" aria-live="polite">
            {localUserMessage && (
              <div className="message-item message-item--user message-item--pending">
                <div className="message-item__body">
                  {localUserMessage.attachments.length > 0 && (
                    <div className="message-item__attachments">
                      {localUserMessage.attachments.map((attachment) => (
                        <span key={attachment.name} className="message-item__attachment"><span aria-hidden="true">📎</span> {attachment.name}</span>
                      ))}
                    </div>
                  )}
                  <div className="message-item__text">{localUserMessage.content}</div>
                </div>
              </div>
            )}
            {segments.length > 0 && (
              <div className="message-item message-item--ai">
                <div className="message-item__body">
                  {segments.map((segment, index) => segment.kind === 'text'
                    ? <MarkdownMessage key={index} content={segment.content} />
                    : <ToolCard key={index} event={segment.event} />)}
                </div>
              </div>
            )}
            {truncated && <div className="message-list__truncated">{t('ai.truncated')}</div>}
          </div>
        )}
        {!active && error && (
          <div className="message-list__error" role="alert">
            <span>{t('ai.streamError')}：{error}</span>
            {onRetry && <button type="button" onClick={onRetry}>{t('ai.retrySend')}</button>}
          </div>
        )}
      </div>
      {autoScrollPaused && (
        <button type="button" className="message-list__back-to-latest" onClick={backToLatest}>
          {t('ai.backToLatest')}
        </button>
      )}
    </div>
  );
}

/** 紧凑工具卡片：参数摘要 + 完成后的结果摘录（可展开工具行属 ResearchMode，Plan C）。 */
function ToolCard({ event }: { event: { tool: string; status: string; argsDigest: string; resultExcerpt: string } }) {
  const { t } = useI18n();
  return (
    <div className={`tool-card tool-card--${event.status}`} data-tool={event.tool}>
      <span className="tool-card__icon">{event.status === 'done' ? '✓' : '⚙'}</span>
      <span className="tool-card__name">{event.tool}</span>
      {event.argsDigest && <span className="tool-card__digest">{event.argsDigest}</span>}
      <span className="tool-card__status">{event.status === 'done' ? t('ai.toolDone') : t('ai.toolRunning')}</span>
      {event.status === 'done' && event.resultExcerpt && (
        <div className="tool-card__excerpt">{event.resultExcerpt}</div>
      )}
    </div>
  );
}

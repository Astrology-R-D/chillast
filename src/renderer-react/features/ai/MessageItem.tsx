import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { AiSessionSummary } from '../../api/contracts';
import { MarkdownMessage } from './MarkdownMessage';

type ChatMessage = AiSessionSummary['messages'][number];

export interface MessageItemProps {
  index: number;
  message: ChatMessage;
  /** 流进行中：工具条禁用（避免中途改写会话）。 */
  disabled?: boolean;
  /** 仅 assistant 末条由父层传入。 */
  onRegenerate?: () => void;
  onCopy?(content: string): void;
  onQuote?(content: string): void;
  onEditResend?(index: number, nextContent: string): void;
  onFork?(index: number): void;
}

/** 单条历史消息：气泡 + 悬停工具条 + 末条编辑重发。编辑重发不携带原附件（spec §4）。 */
export function MessageItem({ index, message, disabled, onRegenerate, onCopy, onQuote, onEditResend, onFork }: MessageItemProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isUser = message.role === 'user';
  const hasAttachments = Boolean(message.attachments?.length);

  const submitEdit = () => {
    const next = draft.trim();
    if (!next || !onEditResend) return;
    onEditResend(index, next);
    setEditing(false);
  };

  return (
    <div className={`message-item message-item--${isUser ? 'user' : 'ai'}`} data-role={message.role}>
      <div className="message-item__body">
        {hasAttachments && (
          <div className="message-item__attachments">
            {message.attachments!.map((attachment) => (
              <span key={attachment.name} className="message-item__attachment"><span aria-hidden="true">📎</span> {attachment.name}</span>
            ))}
          </div>
        )}
        {isUser ? <div className="message-item__text">{message.content}</div> : <MarkdownMessage content={message.content} />}
      </div>
      <div className="message-item__actions" data-disabled={disabled ? 'true' : undefined}>
        {onCopy && <button type="button" disabled={disabled} onClick={() => onCopy(message.content)}>{t('ai.copy')}</button>}
        {onQuote && <button type="button" disabled={disabled} onClick={() => onQuote(message.content)}>{t('ai.quote')}</button>}
        {onFork && <button type="button" disabled={disabled} onClick={() => onFork(index)}>{t('ai.fork')}</button>}
        {isUser && onEditResend && !editing && (
          <button type="button" disabled={disabled} onClick={() => { setDraft(message.content); setEditing(true); }}>{t('ai.editResend')}</button>
        )}
        {!isUser && onRegenerate && (
          <button type="button" disabled={disabled} onClick={onRegenerate}>{t('ai.regenerate')}</button>
        )}
      </div>
      {editing && (
        <div className="message-item__editor">
          <textarea aria-label={t('ai.editMessage')} value={draft} rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitEdit(); }
            }} />
          <div className="message-item__editor-actions">
            <button type="button" onClick={submitEdit}>{t('ai.resend')}</button>
            <button type="button" onClick={() => setEditing(false)}>{t('ai.cancelEdit')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

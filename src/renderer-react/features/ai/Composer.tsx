import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useAiStreamStore } from '../../stores/aiStreamStore';
import type { ChatAttachment } from './chatMessage';

const MAX_ATTACHMENT_BYTES = 200 * 1024;
const MAX_INPUT_HEIGHT_PX = 120;

export interface ComposerProps {
  disabled?: boolean;
  /** provider · model 芯片文本（由 AiWorkspace 状态头传入）。 */
  statusChip?: string | null;
  onSend(text: string, attachments: ChatAttachment[]): void;
  onStop(): void;
  /** 引用预填（ChatMode 的引用按钮驱动）；应用后由 onQuoteConsumed 清空。 */
  quoteDraft?: string;
  onQuoteConsumed?(): void;
}

export function Composer({ disabled, statusChip, onSend, onStop, quoteDraft, onQuoteConsumed }: ComposerProps) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const active = useAiStreamStore((state) => state.active);
  const toolCalling = useAiStreamStore((state) => state.active
    && state.segments.some((segment) => segment.kind === 'tool' && segment.event.status === 'calling'));

  // 引用预填走 effect：userEvent/act 环境内同步 flush，渲染期 setState 会打 React 警告。
  const quoteAppliedRef = useRef('');
  useEffect(() => {
    // draft 清空时归零去重 ref：再次引用同一条消息不会被吞。
    if (!quoteDraft) { quoteAppliedRef.current = ''; return; }
    if (quoteAppliedRef.current === quoteDraft) return;
    quoteAppliedRef.current = quoteDraft;
    setText((current) => (current ? `${current}\n\n${quoteDraft}` : quoteDraft));
    onQuoteConsumed?.();
  }, [quoteDraft, onQuoteConsumed]);

  const blocked = disabled || active;

  const autoGrow = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`;
  };

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || blocked) return;
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
    requestAnimationFrame(autoGrow);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(`${file.name}：${t('ai.attachmentTooLarge')}`);
        continue;
      }
      try {
        const content = await file.text();
        if (content.length === 0) continue;
        next.push({ name: file.name, content });
      } catch {
        setAttachmentError(`${file.name}：${t('ai.attachmentReadFailed')}`);
      }
    }
    if (next.length > 0) {
      setAttachments((current) => [...current, ...next]);
      setAttachmentError('');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="composer">
      {statusChip && (
        <div className="composer__status" data-calling={toolCalling ? 'true' : undefined}>
          <span>{statusChip}</span>
          {toolCalling && <span className="composer__tool-activity"><span aria-hidden="true">⚙</span> {t('ai.toolRunning')}</span>}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="composer__attachments">
          {attachments.map((attachment, index) => (
            <span key={`${attachment.name}-${index}`} className="composer__attachment">
              <span aria-hidden="true">📎</span> {attachment.name}
              <button type="button" aria-label={`${t('ai.removeAttachment')} ${attachment.name}`}
                onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}>×</button>
            </span>
          ))}
        </div>
      )}
      {attachmentError && <div className="composer__attachment-error" role="alert">{attachmentError}</div>}
      <div className="composer__row">
        <textarea ref={textareaRef} className="composer__input" rows={1}
          aria-label={t('ai.inputBox')} placeholder={t('ai.inputPlaceholder')}
          disabled={blocked} value={text}
          onChange={(event) => { setText(event.target.value); autoGrow(); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
          }} />
        <label className="composer__attach" data-disabled={blocked ? 'true' : undefined}>
          <span aria-hidden="true">📎</span>
          <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv,text/*"
            aria-label={t('ai.attach')} disabled={blocked}
            onChange={(event) => { void handleFiles(event.target.files); }} />
        </label>
        {active
          ? <button type="button" className="composer__stop" onClick={onStop}>{t('ai.stop')}</button>
          : <button type="button" className="composer__send" disabled={blocked || !text.trim()} onClick={send}>{t('ai.send')}</button>}
      </div>
    </div>
  );
}

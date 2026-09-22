export interface ChatAttachment {
  name: string;
  content: string;
}

/** 附件以 markdown 引用块内联进消息正文（spec §4：文本内联，随消息持久化）。 */
export function buildChatMessageContent(text: string, attachments: ChatAttachment[]): string {
  const blocks = attachments.map((attachment, index) => {
    const label = attachments.length === 1
      ? `> **附件：${attachment.name}**`
      : `> **附件 ${index + 1}：${attachment.name}**`;
    const lines = attachment.content.split('\n').map((line) => `> ${line}`.trimEnd());
    return [label, ...lines].join('\n');
  });
  const parts = [text.trim(), ...blocks].filter((part) => part.length > 0);
  return parts.join('\n\n');
}

/** 消息在存储中无 id，编辑重发/重新生成以「末条 user 消息」下标定位（spec §2）。 */
export function lastUserMessageIndex(messages: Array<{ role: string; content?: string }>): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return -1;
}

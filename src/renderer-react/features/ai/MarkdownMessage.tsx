import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Streamed and persisted chat bodies render as GFM markdown; links open externally. */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

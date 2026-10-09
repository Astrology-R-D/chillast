import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo } from 'react';
import type { AnalysisReport } from '../../api/contracts';
import { EvidenceChip } from './EvidenceChip';
import './markdown.css';

/** Streamed and persisted chat bodies render as GFM markdown; links open externally. */
export const MarkdownMessage = memo(function MarkdownMessage({ content, report }: { content: string; report?: AnalysisReport | null }) {
  return (
    <div className="markdown-message markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => /^evidence:E\d+$/.test(url) ? url : defaultUrlTransform(url)}
        components={{
          a: ({ href, children }) => href?.startsWith('evidence:') ? <EvidenceChip id={href.slice(9)} report={report} /> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

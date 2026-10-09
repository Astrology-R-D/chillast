import type { SourceSnapshot } from '../../api/contracts';

export function SourceCard({ source }: { source: SourceSnapshot }) {
  const lines = source.location?.lines;
  return <details className="source-card">
    <summary>{source.title}{lines && <small> · {source.pack ? '整理文本' : ''}第 {lines.from}–{lines.to} 行</small>}</summary>
    {source.pack && <small>{source.pack.name} · v{source.pack.version} · {source.corpus}</small>}
    <blockquote>{source.content}</blockquote>
    <small>{source.source} · {source.id} · 版本 {source.version.slice(0, 10)}</small>
    {source.provenance?.sourceName && <small>原始文件：{source.provenance.sourceName} · 原 PDF 页码映射未经核对</small>}
    {source.url && /^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noopener noreferrer">打开来源</a>}
  </details>;
}

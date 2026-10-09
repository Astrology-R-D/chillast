import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SourceCard } from './SourceCard';
test('package citations name the pinned version and identify prepared-text lines honestly', () => {
  render(<SourceCard source={{ id: 'S1', documentId: 'D1', version: 'abcdef123456', title: '八字书 · 十神', source: 'pack', content: '当时引用的原文', corpus: 'bazi',
    pack: { id: 'bazi-library', name: '八字知识库', version: '1.0.0', fingerprint: 'one' }, location: { lines: { from: 5, to: 8 }, basis: 'prepared-text', originalPageMapping: 'unverified' }, provenance: { sourceName: '八字书.pdf' } }} />);
  expect(screen.getByText(/八字知识库 · v1.0.0/)).toBeInTheDocument();
  expect(screen.getByText(/整理文本第 5–8 行/)).toBeInTheDocument();
  expect(screen.getByText(/原 PDF 页码映射未经核对/)).toBeInTheDocument();
  expect(screen.getByText('当时引用的原文')).toBeInTheDocument();
});

import { render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import locale from '../../../../locale/zh.json';
import { I18nProvider } from '../../i18n/I18nProvider';
import { KnowledgeSection } from './KnowledgeSection';

test('shows indexed Bazi documents and marks missing managed source files without hiding them', () => {
  render(<I18nProvider dictionary={locale}><KnowledgeSection onChanged={vi.fn()} docs={[
    { id: 'index:builtin:bazi', name: '四柱算命术.md', source: 'builtin', importedAt: '', cachedOnly: true },
    { id: '/knowledge/planets.md', name: 'planets.md', source: 'builtin', importedAt: '' },
    { id: 'index:user:notes', name: '八字笔记.md', source: 'user', importedAt: '', cachedOnly: true },
  ]} /></I18nProvider>);
  expect(screen.getByText('内置文档 (2)')).toBeInTheDocument();
  expect(screen.getByText('用户文档 (1)')).toBeInTheDocument();
  expect(screen.getAllByTitle(locale.settings.cachedKnowledgeHint)).toHaveLength(2);
  const bazi = screen.getByText('四柱算命术.md').closest('.settings-list-item') as HTMLElement;
  expect(within(bazi).getByText(locale.settings.cachedKnowledge)).toBeInTheDocument();
  expect(within(bazi).queryByRole('button')).not.toBeInTheDocument();
  const planets = screen.getByText('planets.md').closest('.settings-list-item') as HTMLElement;
  expect(within(planets).queryByText(locale.settings.cachedKnowledge)).not.toBeInTheDocument();
  expect(screen.getByText('八字笔记.md')).toBeInTheDocument();
});

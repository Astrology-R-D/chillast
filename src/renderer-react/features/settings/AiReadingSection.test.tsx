import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import locale from '../../../../locale/zh.json';
import { preferencesStore } from '../../preferences/preferences';
import { AiReadingSection } from './AiReadingSection';

beforeEach(() => preferencesStore.getState().resetAiReading());
test('reading controls preview changes, persist them, and restore comfortable defaults', () => {
  const { container } = render(<I18nProvider dictionary={locale}><AiReadingSection /></I18nProvider>);
  fireEvent.change(screen.getByLabelText('字号'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('行距'), { target: { value: '2.1' } });
  fireEvent.change(screen.getByLabelText('阅读字体'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('本机字体名称'), { target: { value: '微软雅黑' } });
  const preview = container.querySelector('.reading-preview') as HTMLElement;
  expect(preview.style.getPropertyValue('--ai-font-size')).toBe('20px');
  expect(preview.style.getPropertyValue('--ai-line-height')).toBe('2.1');
  expect(preview.style.getPropertyValue('--ai-font-family')).toContain('微软雅黑');
  expect(JSON.parse(window.localStorage.getItem('chillast.aiReading')!)).toMatchObject({ fontSize: 20, lineHeight: 2.1, customFont: '微软雅黑' });
  fireEvent.click(screen.getByRole('button', { name: '判据 1' }));
  expect(screen.getByText('展开判据后，正文与卡片也使用当前阅读设置。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '舒适阅读（恢复默认）' }));
  expect(preview.style.getPropertyValue('--ai-font-size')).toBe('16px');
  expect(screen.queryByLabelText('本机字体名称')).not.toBeInTheDocument();
});

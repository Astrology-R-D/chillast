import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { I18nProvider, useI18n } from './I18nProvider';

function Translation({ id, variables }: { id: string; variables?: Record<string, string | number> }) {
  const { t } = useI18n();
  return <span>{t(id, variables)}</span>;
}

describe('I18nProvider', () => {
  test('looks up nested translation keys', () => {
    render(
      <I18nProvider dictionary={{ actions: { save: '保存' } }}>
        <Translation id="actions.save" />
      </I18nProvider>,
    );

    expect(screen.getByText('保存')).toBeInTheDocument();
  });

  test('interpolates provided variables and preserves missing variables', () => {
    render(
      <I18nProvider dictionary={{ greeting: '你好，{{name}}，共 {{count}} 项，{{missing}}' }}>
        <Translation id="greeting" variables={{ name: '星盘', count: 3 }} />
      </I18nProvider>,
    );

    expect(screen.getByText('你好，星盘，共 3 项，{{missing}}')).toBeInTheDocument();
  });

  test('returns the key when a translation is missing', () => {
    render(
      <I18nProvider dictionary={{}}>
        <Translation id="missing.key" />
      </I18nProvider>,
    );

    expect(screen.getByText('missing.key')).toBeInTheDocument();
  });

  test('throws when the hook is used outside the provider', () => {
    expect(() => render(<Translation id="actions.save" />)).toThrow(
      'useI18n must be used within an I18nProvider',
    );
  });
});

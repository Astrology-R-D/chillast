import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { Navigation } from './Navigation';

const dictionary = {
  app: { title: 'CHILLAST' },
  nav: {
    profiles: '档案管理', personal: '个人星盘', relationship: '合盘分析', chinese: '命理分析',
    solarTerms: '节气年历', settings: '设置', groupProfiles: '档案', groupCharts: '星盘',
    groupChinese: '命理', groupTools: '工具',
  },
};

test('renders grouped native route buttons and marks the active route', async () => {
  const user = userEvent.setup();
  const onNavigate = vi.fn();
  render(
    <I18nProvider dictionary={dictionary}>
      <Navigation active="personal" onNavigate={onNavigate} />
    </I18nProvider>,
  );

  expect(screen.getAllByRole('button')).toHaveLength(6);
  expect(screen.getByText('CHILLAST')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '个人星盘' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: '个人星盘' })).toHaveAttribute('data-active', 'true');
  expect(screen.getAllByText(/^(档案|星盘|命理|工具)$/)).toHaveLength(4);

  await user.click(screen.getByRole('button', { name: '合盘分析' }));
  screen.getByRole('button', { name: '设置' }).focus();
  await user.keyboard('{Enter}');
  expect(onNavigate).toHaveBeenNthCalledWith(1, 'relationship');
  expect(onNavigate).toHaveBeenNthCalledWith(2, 'settings');
});

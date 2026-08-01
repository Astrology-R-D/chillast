import { createRoot } from 'react-dom/client';
import { apiClient } from './api/client';
import { applyRuntimeConfig } from './config/applyRuntimeConfig';
import { I18nProvider } from './i18n/I18nProvider';
import { startPreferenceSync } from './preferences/preferences';
import { AppShell } from './shell/AppShell';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/density.css';
import './styles/global.css';
import './shell/shell.css';

const stopPreferenceSync = startPreferenceSync();
window.addEventListener('beforeunload', stopPreferenceSync, { once: true });

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('React root element is missing');
}

const root = createRoot(rootElement);

void Promise.all([apiClient.getConfig(), apiClient.getLocale()]).then(
  ([config, dictionary]) => {
    applyRuntimeConfig(config);
    root.render(
      <I18nProvider dictionary={dictionary}>
        <AppShell />
      </I18nProvider>,
    );
  },
  (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    root.render(<main role="alert">应用启动失败：{message}</main>);
  },
);

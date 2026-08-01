import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from './api/client';
import { applyRuntimeConfig } from './config/applyRuntimeConfig';
import { I18nProvider } from './i18n/I18nProvider';
import { AppShell } from './shell/AppShell';

const CONFIG_QUERY_KEY = ['startup', 'config'] as const;
const LOCALE_QUERY_KEY = ['startup', 'locale'] as const;

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function App() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: CONFIG_QUERY_KEY, queryFn: apiClient.getConfig });
  const locale = useQuery({ queryKey: LOCALE_QUERY_KEY, queryFn: apiClient.getLocale });

  useEffect(() => {
    if (config.data) applyRuntimeConfig(config.data);
  }, [config.data]);

  const error = config.error ?? locale.error;
  if (error) {
    return (
      <main role="alert">
        <p>应用启动失败：{errorMessage(error)}</p>
        <button
          type="button"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['startup'] })}
        >
          重试
        </button>
      </main>
    );
  }

  if (!config.data || !locale.data) {
    return <main role="status">正在启动应用…</main>;
  }

  return (
    <I18nProvider dictionary={locale.data}>
      <AppShell />
    </I18nProvider>
  );
}

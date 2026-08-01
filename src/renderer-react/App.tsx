import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiClient } from './api/client';
import { applyRuntimeConfig } from './config/applyRuntimeConfig';
import { I18nProvider, translate } from './i18n/I18nProvider';
import { AppShell } from './shell/AppShell';

export const STARTUP_TIMEOUT_MS = 10000;

const FALLBACK_BOOT_TEXT = '正在校准星图…';
const FALLBACK_BOOT_ERROR = '应用启动失败：{{message}}';
const FALLBACK_RETRY = '重试';

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function withTimeout<T>(
  request: Promise<T>,
  resource: string,
  timeoutMs = STARTUP_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => finish(() => reject(new Error(`${resource} 请求已取消`)));
    const timer = setTimeout(
      () => finish(() => reject(new Error(`${resource} 请求超时`))),
      timeoutMs,
    );

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    request.then(
      (value) => finish(() => resolve(value)),
      (reason) => finish(() => reject(reason)),
    );
  });
}

export function App({ startupTimeoutMs = STARTUP_TIMEOUT_MS }: { startupTimeoutMs?: number }) {
  const [attempt, setAttempt] = useState(0);
  const config = useQuery({
    queryKey: ['startup', attempt, 'config'],
    queryFn: ({ signal }) => withTimeout(apiClient.getConfig(), 'config', startupTimeoutMs, signal),
  });
  const locale = useQuery({
    queryKey: ['startup', attempt, 'locale'],
    queryFn: ({ signal }) => withTimeout(apiClient.getLocale(), 'locale', startupTimeoutMs, signal),
  });

  useEffect(() => {
    if (config.data) applyRuntimeConfig(config.data);
  }, [config.data]);

  const error = config.error ?? locale.error;
  if (error) {
    const message = errorMessage(error);
    return (
      <main role="alert">
        <p>{translate(locale.data, 'app.bootError', { message }, FALLBACK_BOOT_ERROR)}</p>
        <button
          type="button"
          onClick={() => setAttempt((current) => current + 1)}
        >
          {translate(locale.data, 'shell.retry', {}, FALLBACK_RETRY)}
        </button>
      </main>
    );
  }

  if (!config.data || !locale.data) {
    return <main role="status">{translate(locale.data, 'app.bootText', {}, FALLBACK_BOOT_TEXT)}</main>;
  }

  return (
    <I18nProvider dictionary={locale.data}>
      <AppShell />
    </I18nProvider>
  );
}

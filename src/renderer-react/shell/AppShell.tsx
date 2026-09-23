import { Component, lazy, Suspense, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  type Density,
  type ThemePreference,
  usePreferences,
} from '../preferences/preferences';
import { useAiStreamStore } from '../stores/aiStreamStore';
import { AiWorkspace } from '../features/ai/AiWorkspace';
import { ProfilePage } from '../features/profiles/ProfilePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { Navigation } from './Navigation';
import { PanelLayout } from './PanelLayout';
import { ROUTES, type RouteKey } from './routes';
import { DirtyNavigationProvider, useDirtyNavigation } from './DirtyNavigationProvider';

type ChartRoute = 'personal' | 'relationship';
interface ChartWorkbenchModule { ChartWorkbenchPage: ComponentType<{ route: ChartRoute }> }
export interface ChartWorkbenchLoader {
  load(): Promise<ChartWorkbenchModule>;
  resolved(): ChartWorkbenchModule | undefined;
}

function importChartWorkbench() {
  return import('../features/charts/workbench/ChartWorkbenchPage');
}

export function createChartWorkbenchLoader(importer: () => Promise<ChartWorkbenchModule>): ChartWorkbenchLoader {
  let module: ChartWorkbenchModule | undefined;
  let pending: Promise<ChartWorkbenchModule> | undefined;
  return {
    load() {
      if (module) return Promise.resolve(module);
      if (pending) return pending;
      const request = importer().then((loaded) => {
        module = loaded;
        pending = undefined;
        return loaded;
      }, (error: unknown) => {
        pending = undefined;
        throw error;
      });
      pending = request;
      return request;
    },
    resolved: () => module,
  };
}

const chartWorkbenchLoader = createChartWorkbenchLoader(importChartWorkbench);

export async function preloadChartWorkbench(): Promise<void> {
  await chartWorkbenchLoader.load();
}

class ChartRouteErrorBoundary extends Component<{
  children: ReactNode;
  errorLabel: string;
  retryLabel: string;
  onRetry(): void;
}, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error);
    return <section className="workspace__route-error" role="alert">
      <p>{this.props.errorLabel}: {message}</p>
      <button type="button" onClick={this.props.onRetry}>{this.props.retryLabel}</button>
    </section>;
  }
}

export function ChartWorkbenchRoute({ route, loader = chartWorkbenchLoader }: { route: ChartRoute; loader?: ChartWorkbenchLoader }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const LazyChartWorkbenchPage = useMemo(() => lazy(() => loader.load().then(
    (module) => ({ default: module.ChartWorkbenchPage }),
  )), [attempt, loader, route]);
  const loaded = loader.resolved();
  const page = loaded
    ? (() => { const Loaded = loaded.ChartWorkbenchPage; return <Loaded route={route} />; })()
    : <LazyChartWorkbenchPage route={route} />;
  return <ChartRouteErrorBoundary key={`${route}-${attempt}`} errorLabel={t('chart.workbench.routeLoadError')}
    retryLabel={t('chart.workbench.retry')} onRetry={() => setAttempt((value) => value + 1)}>
    <Suspense fallback={<section className="chart-result"><div role="status" aria-live="polite">{t('chart.workbench.startupLoading')}</div></section>}>
      {page}
    </Suspense>
  </ChartRouteErrorBoundary>;
}

export function AppShell() {
  return <DirtyNavigationProvider><AppShellInner /></DirtyNavigationProvider>;
}

function AppShellInner() {
  const { t } = useI18n();
  const [activeRoute, setActiveRoute] = useState<RouteKey>('profiles');
  const theme = usePreferences((state) => state.theme);
  const density = usePreferences((state) => state.density);
  const aiOpenSignal = useAiStreamStore((state) => state.panelOpenSignal);
  const setTheme = usePreferences((state) => state.setTheme);
  const setDensity = usePreferences((state) => state.setDensity);
  const route = ROUTES.find(({ key }) => key === activeRoute) ?? ROUTES[0];
  const PageIcon = route.icon;
  const title = t(route.titleKey);
  const dirtyNavigation = useDirtyNavigation();
  const navigate = (nextRoute: RouteKey, beforeNavigate?: () => void) => {
    void dirtyNavigation.requestTransition(() => { beforeNavigate?.(); setActiveRoute(nextRoute); });
  };

  return (
    <PanelLayout
      navigation={<Navigation active={activeRoute} onNavigate={navigate} />}
      ai={<AiWorkspace onNavigate={navigate} />}
      aiOpenSignal={aiOpenSignal}
      labels={{
        openAi: t('shell.openAi'),
        closeAi: t('shell.closeAi'),
        resizeNavigation: t('shell.resizeNavigation'),
        resizeAi: t('shell.resizeAi'),
        navigationRegion: t('shell.navigationRegion'),
        workspaceRegion: t('shell.workspaceRegion'),
        aiRegion: t('shell.aiRegion'),
      }}
    >
      <div className={`workspace${activeRoute === 'personal' || activeRoute === 'relationship' ? ' workspace--chart' : ''}`}>
        <header className="workspace__header">
          <h1 id="workspace-title">{title}</h1>
          <div className="workspace__appearance">
            <label>
              <span>{t('shell.theme')}</span>
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value as ThemePreference)}
              >
                <option value="system">{t('appearance.system')}</option>
                <option value="light">{t('appearance.light')}</option>
                <option value="dark">{t('appearance.dark')}</option>
              </select>
            </label>
            <label>
              <span>{t('shell.density')}</span>
              <select
                value={density}
                onChange={(event) => setDensity(event.target.value as Density)}
              >
                <option value="compact">{t('appearance.compact')}</option>
                <option value="comfortable">{t('appearance.comfortable')}</option>
              </select>
            </label>
          </div>
        </header>
        {activeRoute === 'profiles' ? <ProfilePage onNavigate={navigate} />
          : activeRoute === 'personal' || activeRoute === 'relationship'
            ? <ChartWorkbenchRoute route={activeRoute} />
            : activeRoute === 'settings' ? <SettingsPage onNavigate={navigate} />
            : <section className="workspace__placeholder" aria-labelledby="workspace-title">
                <PageIcon aria-hidden="true" size={34} strokeWidth={1.5} />
                <p>{t('shell.placeholder', { title })}</p>
              </section>}
      </div>
    </PanelLayout>
  );
}

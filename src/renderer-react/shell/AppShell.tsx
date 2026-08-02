import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  type Density,
  type ThemePreference,
  usePreferences,
} from '../preferences/preferences';
import { AiStatusPanel } from './AiStatusPanel';
import { ProfilePage } from '../features/profiles/ProfilePage';
import { Navigation } from './Navigation';
import { PanelLayout } from './PanelLayout';
import { ROUTES, type RouteKey } from './routes';
import { DirtyNavigationProvider, useDirtyNavigation } from './DirtyNavigationProvider';

export function AppShell() {
  return <DirtyNavigationProvider><AppShellInner /></DirtyNavigationProvider>;
}

function AppShellInner() {
  const { t } = useI18n();
  const [activeRoute, setActiveRoute] = useState<RouteKey>('profiles');
  const theme = usePreferences((state) => state.theme);
  const density = usePreferences((state) => state.density);
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
      ai={<AiStatusPanel />}
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
      <div className="workspace">
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
        {activeRoute === 'profiles' ? <ProfilePage onNavigate={navigate} /> :
          <section className="workspace__placeholder" aria-labelledby="workspace-title">
            <PageIcon aria-hidden="true" size={34} strokeWidth={1.5} />
            <p>{t('shell.placeholder', { title })}</p>
          </section>}
      </div>
    </PanelLayout>
  );
}

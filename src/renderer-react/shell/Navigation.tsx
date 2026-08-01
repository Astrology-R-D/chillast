import { useI18n } from '../i18n/I18nProvider';
import { ROUTES, type RouteKey, type RouteMetadata } from './routes';

interface RouteGroup {
  groupKey: string;
  routes: RouteMetadata[];
}

const ROUTE_GROUPS = ROUTES.reduce<RouteGroup[]>((groups, route) => {
  const current = groups[groups.length - 1];
  if (current?.groupKey === route.groupKey) current.routes.push(route);
  else groups.push({ groupKey: route.groupKey, routes: [route] });
  return groups;
}, []);

export interface NavigationProps {
  active: RouteKey;
  onNavigate: (route: RouteKey) => void;
}

export function Navigation({ active, onNavigate }: NavigationProps) {
  const { t } = useI18n();

  return (
    <div className="shell-nav">
      <div className="shell-nav__brand" title={t('app.title')}>
        <span className="shell-nav__mark" aria-hidden="true">✶</span>
        <span className="shell-nav__brand-name">{t('app.title')}</span>
      </div>
      <div className="shell-nav__routes">
        {ROUTE_GROUPS.map((group) => {
          const headingId = `shell-nav-${group.groupKey.replace('.', '-')}`;
          return (
            <section
              key={group.groupKey}
              className="shell-nav__route-group"
              role="group"
              aria-labelledby={headingId}
            >
              <h2 id={headingId} className="shell-nav__group">{t(group.groupKey)}</h2>
              {group.routes.map((route) => {
                const label = t(route.labelKey);
                const Icon = route.icon;
                return (
                  <button
                    key={route.key}
                    className="shell-nav__button"
                    type="button"
                    aria-label={label}
                    aria-current={active === route.key ? 'page' : undefined}
                    data-active={active === route.key ? 'true' : undefined}
                    title={label}
                    onClick={() => onNavigate(route.key)}
                  >
                    <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                    <span className="shell-nav__label">{label}</span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

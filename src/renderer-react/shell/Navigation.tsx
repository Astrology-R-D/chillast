import { Fragment } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ROUTES, type RouteKey } from './routes';

export interface NavigationProps {
  active: RouteKey;
  onNavigate: (route: RouteKey) => void;
}

export function Navigation({ active, onNavigate }: NavigationProps) {
  const { t } = useI18n();
  let previousGroup = '';

  return (
    <div className="shell-nav">
      <div className="shell-nav__brand" title={t('app.title')}>
        <span className="shell-nav__mark" aria-hidden="true">✶</span>
        <span className="shell-nav__brand-name">{t('app.title')}</span>
      </div>
      <div className="shell-nav__routes">
        {ROUTES.map((route) => {
          const showGroup = route.groupKey !== previousGroup;
          previousGroup = route.groupKey;
          const label = t(route.labelKey);
          const Icon = route.icon;
          return (
            <Fragment key={route.key}>
              {showGroup && <div className="shell-nav__group">{t(route.groupKey)}</div>}
              <button
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
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

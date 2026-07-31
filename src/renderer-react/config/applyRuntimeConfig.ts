import type { AppConfig } from '../api/contracts';

const managedProperties = new Set<string>();

function setProperty(name: string, value: string | number): void {
  document.documentElement.style.setProperty(name, String(value));
  managedProperties.add(name);
}

export function applyRuntimeConfig(config: AppConfig | null | undefined): void {
  for (const name of managedProperties) {
    document.documentElement.style.removeProperty(name);
  }
  managedProperties.clear();

  if (!config) return;

  for (const [name, value] of Object.entries(config.spacing ?? {})) {
    setProperty(`--sp-${name}`, value);
  }
  for (const [name, value] of Object.entries(config.type ?? {})) {
    setProperty(`--fs-${name}`, value);
  }
  for (const [name, value] of Object.entries(config.weight ?? {})) {
    setProperty(`--fw-${name}`, value);
  }

  const layoutTokens = {
    sidebarWidth: '--sidebar-width',
    chartCanvasMaxWidth: '--chart-max-width',
    headerHeight: '--header-height',
    responsiveBreakpoint: '--responsive-breakpoint',
  } as const;

  for (const [key, property] of Object.entries(layoutTokens)) {
    const value = config.layout?.[key];
    if (typeof value === 'number') setProperty(property, `${value}px`);
  }
}

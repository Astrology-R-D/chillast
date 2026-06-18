export function applyConfig(config) {
  if (!config) return;

  if (config.theme) {
    applyTheme(config.theme);
  }

  if (config.layout) {
    applyLayout(config.layout);
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  const toVar = (key) => `--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`;
  for (const [key, value] of Object.entries(theme)) {
    root.style.setProperty(toVar(key), String(value));
  }
}

function applyLayout(layout) {
  const root = document.documentElement;
  if (layout.sidebarWidth != null) {
    root.style.setProperty('--sidebar-width', `${layout.sidebarWidth}px`);
  }
  if (layout.chartCanvasMaxWidth != null) {
    root.style.setProperty('--chart-max-width', `${layout.chartCanvasMaxWidth}px`);
  }
  if (layout.workbenchGridColumns != null) {
    root.style.setProperty('--workbench-grid', layout.workbenchGridColumns);
  }
}

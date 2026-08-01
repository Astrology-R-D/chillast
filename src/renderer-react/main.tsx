import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppProviders } from './AppProviders';
import { startPreferenceSync } from './preferences/preferences';
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
root.render(
  <AppProviders>
    <App />
  </AppProviders>,
);

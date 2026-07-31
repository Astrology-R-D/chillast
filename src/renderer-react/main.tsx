import { createRoot } from 'react-dom/client';
import { startPreferenceSync } from './preferences/preferences';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/density.css';
import './styles/global.css';

const stopPreferenceSync = startPreferenceSync();
window.addEventListener('beforeunload', stopPreferenceSync, { once: true });

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('React root element is missing');
}

createRoot(rootElement).render(
  <main aria-label="CHILLAST React renderer">React renderer bootstrap</main>,
);
